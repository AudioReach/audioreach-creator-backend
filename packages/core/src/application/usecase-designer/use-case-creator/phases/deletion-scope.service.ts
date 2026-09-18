/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SgkvEntry} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';
import {DELETED_COMPONENT_TYPE} from '../contracts/routing-state.js';
import type {
  DataLinkLossPair,
  DeletionAnalysis,
  DeletionReconstructionPath,
  DeletionPreservedUsecase,
  DeletedComponent,
  DeletedComponentType,
  IslandUseCaseCandidate,
  UsecaseDeletionMark,
} from '../contracts/routing-state.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';

interface StoredTopology {
  readonly kind: 'single-path' | 'multi-path';
  readonly startSubgraphSystemId?: number;
  readonly endSubgraphSystemId?: number;
}

interface DirectedAdjacencyEdge {
  readonly destSubgraphSystemId: number;
  readonly isEc: boolean;
}

interface DeletionSideConflicts {
  readonly excludedDeletedSubgraphSystemIds?: readonly number[];
  readonly excludedDeletedDataLinkSystemIds?: readonly number[];
  readonly excludedDeletedControlLinkSystemIds?: readonly number[];
  readonly missingSurvivingEndpointSubgraphSystemIds?: readonly number[];
  readonly excludedSurvivingEndpointSubgraphSystemIds?: readonly number[];
}

function unorderedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  // Support is an undirected property: either data-link direction or any control-link
  // direction keeps the stored pair structurally supported.
  return sourceSubgraphSystemId < destSubgraphSystemId
    ? `${sourceSubgraphSystemId}:${destSubgraphSystemId}`
    : `${destSubgraphSystemId}:${sourceSubgraphSystemId}`;
}

function sortedBySystemId<T extends {readonly systemId: number}>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => left.systemId - right.systemId);
}

function sortedIds(ids: readonly number[]): number[] {
  return [...ids].sort((left, right) => left - right);
}

function indexUsecasesByPair(
  usecases: readonly UseCase[],
): ReadonlyMap<string, readonly UseCase[]> {
  // This is intentionally built from the committed catalog. Overlay reads can hide
  // exactly the UCs that deletion impact analysis needs to discover.
  const index = new Map<string, UseCase[]>();
  for (const usecase of sortedBySystemId(usecases)) {
    for (const pair of usecase.subgraphPairs) {
      const key = unorderedPairKey(
        pair.sourceSubgraphSystemId,
        pair.destSubgraphSystemId,
      );
      const entries = index.get(key) ?? [];
      entries.push(usecase);
      index.set(key, entries);
    }
  }
  return index;
}

function indexUsecasesBySubgraph(
  usecases: readonly UseCase[],
): ReadonlyMap<number, readonly UseCase[]> {
  const index = new Map<number, UseCase[]>();
  for (const usecase of sortedBySystemId(usecases)) {
    for (const subgraphSystemId of usecase.subgraphSystemIds) {
      const entries = index.get(subgraphSystemId) ?? [];
      entries.push(usecase);
      index.set(subgraphSystemId, entries);
    }
  }
  return index;
}

function indexLinksByPair(
  links: readonly (DataLink | ControlLink)[],
  deletedSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  // Overlay links describe file-wide surviving support. Request-only exclusions are
  // deliberately absent here because they must not create a false deletion impact.
  const pairs = new Set<string>();
  for (const link of links) {
    if (deletedSystemIds.has(link.systemId)) continue;
    pairs.add(
      unorderedPairKey(link.sourceSubgraphSystemId, link.destSubgraphSystemId),
    );
  }
  return pairs;
}

function deletedComponentPriority(component: DeletedComponent): number {
  // Component impact has a stable precedence when several session deletions touch one UC.
  if (component.type === DELETED_COMPONENT_TYPE.Subgraph) return 3;
  if (component.type === DELETED_COMPONENT_TYPE.DataLink) return 2;
  return 1;
}

function deletedComponent(
  type: DeletedComponentType,
  systemId: number,
): DeletedComponent {
  return {type, systemId};
}

function shouldReplaceDeletedComponent(
  current: DeletedComponent | undefined,
  next: DeletedComponent,
): boolean {
  if (!current) return true;
  const currentPriority = deletedComponentPriority(current);
  const nextPriority = deletedComponentPriority(next);
  if (nextPriority !== currentPriority) return nextPriority > currentPriority;
  return next.systemId < current.systemId;
}

function markForDeletion(
  ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>,
  usecase: UseCase,
  component: DeletedComponent,
): void {
  const current = ucMarkedForDeletionBySystemId.get(usecase.systemId);
  if (
    !current ||
    shouldReplaceDeletedComponent(current.deletedComponent, component)
  ) {
    ucMarkedForDeletionBySystemId.set(usecase.systemId, {
      usecase,
      deletedComponent: component,
    });
  }
}

function classifyStoredTopology(usecase: UseCase): StoredTopology {
  // A single root and leaf identify the shape that can be safely replaced by bounded DFS.
  // Every other shape is treated as multi-path and is never auto-reconstructed.
  const incoming = new Set<number>();
  const outgoing = new Set<number>();
  for (const pair of usecase.subgraphPairs) {
    incoming.add(pair.destSubgraphSystemId);
    outgoing.add(pair.sourceSubgraphSystemId);
  }
  const starts = usecase.subgraphSystemIds.filter(id => !incoming.has(id));
  const ends = usecase.subgraphSystemIds.filter(id => !outgoing.has(id));
  if (starts.length === 1 && ends.length === 1) {
    return {
      kind: 'single-path',
      startSubgraphSystemId: starts[0],
      endSubgraphSystemId: ends[0],
    };
  }
  return {kind: 'multi-path'};
}

function endpointsSurvive(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  deletedSubgraphSystemIds: ReadonlySet<number>,
): boolean {
  return (
    !deletedSubgraphSystemIds.has(sourceSubgraphSystemId) &&
    !deletedSubgraphSystemIds.has(destSubgraphSystemId)
  );
}

function hasPairSupport(
  pair: {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  },
  survivingDataLinkPairKeys: ReadonlySet<string>,
  survivingControlLinkPairKeys: ReadonlySet<string>,
): boolean {
  const key = unorderedPairKey(
    pair.sourceSubgraphSystemId,
    pair.destSubgraphSystemId,
  );
  return (
    survivingDataLinkPairKeys.has(key) || survivingControlLinkPairKeys.has(key)
  );
}

function buildDirectedAdjacency(
  dataLinks: readonly DataLink[],
  deletedDataLinkSystemIds: ReadonlySet<number>,
): ReadonlyMap<number, readonly DirectedAdjacencyEdge[]> {
  // Reconstruction uses the already-filtered routable snapshot, not the overlay catalog.
  // The EC flag is retained so legacy EC boundaries can be opened or guarded per UC.
  const adjacencyBySourceSubgraphId = new Map<
    number,
    Map<number, DirectedAdjacencyEdge>
  >();
  for (const link of sortedBySystemId(dataLinks)) {
    if (deletedDataLinkSystemIds.has(link.systemId)) continue;
    const destinations =
      adjacencyBySourceSubgraphId.get(link.sourceSubgraphSystemId) ??
      new Map<number, DirectedAdjacencyEdge>();
    destinations.set(link.destSubgraphSystemId, {
      destSubgraphSystemId: link.destSubgraphSystemId,
      isEc: link.isEc === true,
    });
    adjacencyBySourceSubgraphId.set(link.sourceSubgraphSystemId, destinations);
  }
  return new Map(
    [...adjacencyBySourceSubgraphId.entries()].map(([source, destinations]) => [
      source,
      [...destinations.values()].sort(
        (left, right) => left.destSubgraphSystemId - right.destSubgraphSystemId,
      ),
    ]),
  );
}

function boundedSimplePaths(
  directedAdjacencyBySourceSubgraphId: ReadonlyMap<
    number,
    readonly DirectedAdjacencyEdge[]
  >,
  startSubgraphSystemId: number,
  endSubgraphSystemId: number,
  allowedSubgraphSystemIds: ReadonlySet<number>,
  maxDepth: number,
  allowedIntermediateSubgraphSystemIds?: ReadonlySet<number>,
  allowEdge?: (
    sourceSubgraphSystemId: number,
    edge: DirectedAdjacencyEdge,
  ) => boolean,
): readonly number[][] {
  // The branch-local visited set prevents cycles while allowing another branch to revisit
  // the same SG. The target is terminal: paths never continue beyond the original end SG.
  if (
    !allowedSubgraphSystemIds.has(startSubgraphSystemId) ||
    !allowedSubgraphSystemIds.has(endSubgraphSystemId)
  ) {
    return [];
  }
  if (startSubgraphSystemId === endSubgraphSystemId) {
    return [[startSubgraphSystemId]];
  }

  const paths: number[][] = [];
  const visited = new Set<number>([startSubgraphSystemId]);
  const currentPath = [startSubgraphSystemId];
  const visit = (currentSubgraphSystemId: number): void => {
    if (currentSubgraphSystemId === endSubgraphSystemId) {
      paths.push([...currentPath]);
      return;
    }
    if (currentPath.length >= maxDepth) return;
    for (const edge of directedAdjacencyBySourceSubgraphId.get(
      currentSubgraphSystemId,
    ) ?? []) {
      const nextSubgraphSystemId = edge.destSubgraphSystemId;
      if (
        !allowedSubgraphSystemIds.has(nextSubgraphSystemId) ||
        visited.has(nextSubgraphSystemId) ||
        (allowEdge && !allowEdge(currentSubgraphSystemId, edge))
      ) {
        continue;
      }
      if (
        nextSubgraphSystemId !== endSubgraphSystemId &&
        allowedIntermediateSubgraphSystemIds &&
        !allowedIntermediateSubgraphSystemIds.has(nextSubgraphSystemId)
      ) {
        continue;
      }
      visited.add(nextSubgraphSystemId);
      currentPath.push(nextSubgraphSystemId);
      visit(nextSubgraphSystemId);
      currentPath.pop();
      visited.delete(nextSubgraphSystemId);
    }
  };
  visit(startSubgraphSystemId);
  return paths;
}

function hasTransparentMdfReplacement(
  dataLink: DataLink,
  routableDataLinkAdjacency: ReadonlyMap<
    number,
    readonly DirectedAdjacencyEdge[]
  >,
  effectiveRoutingScopeSubgraphIds: ReadonlySet<number>,
  mdfSubgraphSystemIds: ReadonlySet<number>,
  maxDepth: number,
): boolean {
  // MDF replacement is narrower than ordinary reconstruction: only MDF SGs may be
  // introduced between the deleted link's original endpoints.
  return boundedSimplePaths(
    routableDataLinkAdjacency,
    dataLink.sourceSubgraphSystemId,
    dataLink.destSubgraphSystemId,
    effectiveRoutingScopeSubgraphIds,
    maxDepth,
    mdfSubgraphSystemIds,
  ).some(path => path.length > 2);
}

function hasAnyValues(conflicts: DeletionSideConflicts): boolean {
  return (
    (conflicts.excludedDeletedSubgraphSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedDeletedDataLinkSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedDeletedControlLinkSystemIds?.length ?? 0) > 0 ||
    (conflicts.missingSurvivingEndpointSubgraphSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedSurvivingEndpointSubgraphSystemIds?.length ?? 0) > 0
  );
}

function buildDeletionSideConflicts(
  context: RoutingContext,
  deletedSubgraphSystemIds: ReadonlySet<number>,
  deletedDataLinks: readonly DataLink[],
  deletedControlLinks: readonly ControlLink[],
): DeletionSideConflicts {
  // FR-API-07 closure is evaluated against explicit caller policy after DEL-02. Deleted
  // control-link endpoints are intentionally excluded because control links do not expand
  // automatic routing scope.
  const {requestPolicy} = context.input;
  const requiredSurvivingEndpointSubgraphSystemIds = new Set<number>();
  for (const dataLink of deletedDataLinks) {
    if (!deletedSubgraphSystemIds.has(dataLink.sourceSubgraphSystemId)) {
      requiredSurvivingEndpointSubgraphSystemIds.add(
        dataLink.sourceSubgraphSystemId,
      );
    }
    if (!deletedSubgraphSystemIds.has(dataLink.destSubgraphSystemId)) {
      requiredSurvivingEndpointSubgraphSystemIds.add(
        dataLink.destSubgraphSystemId,
      );
    }
  }

  const excludedDeletedSubgraphSystemIds = [...deletedSubgraphSystemIds].filter(
    systemId => requestPolicy.explicitlyExcludedSubgraphSystemIds.has(systemId),
  );
  const deletedDataLinkSystemIds = new Set(
    deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    deletedControlLinks.map(link => link.systemId),
  );
  const excludedDeletedDataLinkSystemIds = [...deletedDataLinkSystemIds].filter(
    systemId => requestPolicy.explicitlyExcludedDataLinkSystemIds.has(systemId),
  );
  const excludedDeletedControlLinkSystemIds = [
    ...deletedControlLinkSystemIds,
  ].filter(systemId =>
    requestPolicy.explicitlyExcludedControlLinkSystemIds.has(systemId),
  );
  const missingSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId => !requestPolicy.requestedSubgraphSystemIds.has(systemId));
  const excludedSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId =>
    requestPolicy.explicitlyExcludedSubgraphSystemIds.has(systemId),
  );

  return {
    ...(excludedDeletedSubgraphSystemIds.length > 0 && {
      excludedDeletedSubgraphSystemIds: sortedIds(
        excludedDeletedSubgraphSystemIds,
      ),
    }),
    ...(excludedDeletedDataLinkSystemIds.length > 0 && {
      excludedDeletedDataLinkSystemIds: sortedIds(
        excludedDeletedDataLinkSystemIds,
      ),
    }),
    ...(excludedDeletedControlLinkSystemIds.length > 0 && {
      excludedDeletedControlLinkSystemIds: sortedIds(
        excludedDeletedControlLinkSystemIds,
      ),
    }),
    ...(missingSurvivingEndpointSubgraphSystemIds.length > 0 && {
      missingSurvivingEndpointSubgraphSystemIds: sortedIds(
        missingSurvivingEndpointSubgraphSystemIds,
      ),
    }),
    ...(excludedSurvivingEndpointSubgraphSystemIds.length > 0 && {
      excludedSurvivingEndpointSubgraphSystemIds: sortedIds(
        excludedSurvivingEndpointSubgraphSystemIds,
      ),
    }),
  };
}

function emptyDeletionAnalysis(
  affectedUsecaseSystemIds: ReadonlySet<number>,
): DeletionAnalysis {
  return {
    affectedUsecaseSystemIds,
    markedForDeletion: [],
    preservedUsecases: [],
    islandUseCaseCandidates: [],
    reconstructionPaths: [],
  };
}

interface IslandCandidateDraft {
  readonly usecase: UseCase;
  readonly dataLinkLossPairs: Map<string, DataLinkLossPair>;
}

interface ImpactInventory {
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly deletedDataLinkSystemIds: ReadonlySet<number>;
  readonly deletedControlLinkSystemIds: ReadonlySet<number>;
  readonly survivingDataLinkPairKeys: ReadonlySet<string>;
  readonly survivingControlLinkPairKeys: ReadonlySet<string>;
  readonly ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>;
  readonly islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateDraft>;
  readonly effectiveRoutingScopeSubgraphIds: ReadonlySet<number>;
  readonly routableDataLinkAdjacency: ReadonlyMap<
    number,
    readonly DirectedAdjacencyEdge[]
  >;
  readonly mdfSubgraphSystemIds: ReadonlySet<number>;
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
}

function addIslandCandidate(
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateDraft>,
  usecase: UseCase,
  dataLink: DataLink,
  pairKey: string,
): void {
  // Merge losses by UC so one warning and one candidate describe all degraded pairs.
  const candidate = islandUseCaseCandidatesBySystemId.get(usecase.systemId) ?? {
    usecase,
    dataLinkLossPairs: new Map<string, DataLinkLossPair>(),
  };
  candidate.dataLinkLossPairs.set(`${dataLink.systemId}:${pairKey}`, {
    sourceSubgraphSystemId: dataLink.sourceSubgraphSystemId,
    destSubgraphSystemId: dataLink.destSubgraphSystemId,
    deletedDataLinkSystemId: dataLink.systemId,
  });
  islandUseCaseCandidatesBySystemId.set(usecase.systemId, candidate);
}

function classifyUsecasesByDeletedSubgraphs(
  deletedSgs: readonly {readonly systemId: number}[],
  committedUsecasesBySubgraph: ReadonlyMap<number, readonly UseCase[]>,
  ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>,
): void {
  for (const subgraph of sortedBySystemId(deletedSgs)) {
    for (const usecase of committedUsecasesBySubgraph.get(subgraph.systemId) ??
      []) {
      markForDeletion(
        ucMarkedForDeletionBySystemId,
        usecase,
        deletedComponent(DELETED_COMPONENT_TYPE.Subgraph, subgraph.systemId),
      );
    }
  }
}

function classifyDeletedDataLink(
  dataLink: DataLink,
  survivingDataLinkPairKeys: ReadonlySet<string>,
  survivingControlLinkPairKeys: ReadonlySet<string>,
  committedUsecasesByPair: ReadonlyMap<string, readonly UseCase[]>,
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateDraft>,
  ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>,
  routableDataLinkAdjacency: ReadonlyMap<
    number,
    readonly DirectedAdjacencyEdge[]
  >,
  effectiveRoutingScopeSubgraphIds: ReadonlySet<number>,
  mdfSubgraphSystemIds: ReadonlySet<number>,
): void {
  const pairKey = unorderedPairKey(
    dataLink.sourceSubgraphSystemId,
    dataLink.destSubgraphSystemId,
  );
  if (survivingDataLinkPairKeys.has(pairKey)) return;
  const pairUsecases = committedUsecasesByPair.get(pairKey) ?? [];
  // Check transparent replacement before control-only degradation. A replacement is a
  // structural update, even when a control link also remains on the original pair.
  if (
    hasTransparentMdfReplacement(
      dataLink,
      routableDataLinkAdjacency,
      effectiveRoutingScopeSubgraphIds,
      mdfSubgraphSystemIds,
      Math.max(effectiveRoutingScopeSubgraphIds.size, 1),
    )
  ) {
    for (const usecase of pairUsecases) {
      markForDeletion(
        ucMarkedForDeletionBySystemId,
        usecase,
        deletedComponent(DELETED_COMPONENT_TYPE.DataLink, dataLink.systemId),
      );
    }
    return;
  }
  if (survivingControlLinkPairKeys.has(pairKey)) {
    // Only LINKED UCs need an automatic LINKED -> ISLAND candidate. Existing ISLAND UCs
    // already represent this degraded support state.
    for (const usecase of pairUsecases) {
      if (usecase.type === 'LINKED') {
        addIslandCandidate(
          islandUseCaseCandidatesBySystemId,
          usecase,
          dataLink,
          pairKey,
        );
      }
    }
    return;
  }
  for (const usecase of pairUsecases) {
    markForDeletion(
      ucMarkedForDeletionBySystemId,
      usecase,
      deletedComponent(DELETED_COMPONENT_TYPE.DataLink, dataLink.systemId),
    );
  }
}

function classifyDeletedDataLinks(
  deletedDataLinks: readonly DataLink[],
  survivingDataLinkPairKeys: ReadonlySet<string>,
  survivingControlLinkPairKeys: ReadonlySet<string>,
  committedUsecasesByPair: ReadonlyMap<string, readonly UseCase[]>,
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateDraft>,
  ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>,
  routableDataLinkAdjacency: ReadonlyMap<
    number,
    readonly DirectedAdjacencyEdge[]
  >,
  effectiveRoutingScopeSubgraphIds: ReadonlySet<number>,
  mdfSubgraphSystemIds: ReadonlySet<number>,
): void {
  for (const dataLink of sortedBySystemId(deletedDataLinks)) {
    classifyDeletedDataLink(
      dataLink,
      survivingDataLinkPairKeys,
      survivingControlLinkPairKeys,
      committedUsecasesByPair,
      islandUseCaseCandidatesBySystemId,
      ucMarkedForDeletionBySystemId,
      routableDataLinkAdjacency,
      effectiveRoutingScopeSubgraphIds,
      mdfSubgraphSystemIds,
    );
  }
}

function classifyDeletedControlLinks(
  deletedControlLinks: readonly ControlLink[],
  survivingDataLinkPairKeys: ReadonlySet<string>,
  survivingControlLinkPairKeys: ReadonlySet<string>,
  committedUsecasesByPair: ReadonlyMap<string, readonly UseCase[]>,
  ucMarkedForDeletionBySystemId: Map<number, UsecaseDeletionMark>,
): void {
  for (const controlLink of sortedBySystemId(deletedControlLinks)) {
    const pairKey = unorderedPairKey(
      controlLink.sourceSubgraphSystemId,
      controlLink.destSubgraphSystemId,
    );
    if (
      survivingDataLinkPairKeys.has(pairKey) ||
      survivingControlLinkPairKeys.has(pairKey)
    ) {
      continue;
    }
    for (const usecase of committedUsecasesByPair.get(pairKey) ?? []) {
      markForDeletion(
        ucMarkedForDeletionBySystemId,
        usecase,
        deletedComponent(
          DELETED_COMPONENT_TYPE.ControlLink,
          controlLink.systemId,
        ),
      );
    }
  }
}

function buildImpactInventory(context: RoutingContext): ImpactInventory {
  // This is the only inventory-building pass. Everything below consumes the immutable
  // snapshot and keeps its indexes local to Phase 2.
  const {graphSnapshot} = context.input;
  const {sessionEdits} = graphSnapshot;
  const deletedSubgraphSystemIds = new Set(
    sessionEdits.deletedSgs.map(subgraph => subgraph.systemId),
  );
  const deletedDataLinkSystemIds = new Set(
    sessionEdits.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    sessionEdits.deletedControlLinks.map(link => link.systemId),
  );
  const survivingDataLinkPairKeys = indexLinksByPair(
    graphSnapshot.overlayDataLinks,
    deletedDataLinkSystemIds,
  );
  const survivingControlLinkPairKeys = indexLinksByPair(
    graphSnapshot.overlayControlLinks,
    deletedControlLinkSystemIds,
  );
  const ucMarkedForDeletionBySystemId = new Map<number, UsecaseDeletionMark>();
  const islandUseCaseCandidatesBySystemId = new Map<
    number,
    IslandCandidateDraft
  >();
  const effectiveRoutingScopeSubgraphIds = new Set(
    graphSnapshot.subgraphs.map(item => item.subgraph.systemId),
  );
  const mdfSubgraphSystemIds = new Set(
    graphSnapshot.subgraphs
      .filter(item => item.isMdf)
      .map(item => item.subgraph.systemId),
  );
  const routableDataLinkAdjacency = buildDirectedAdjacency(
    graphSnapshot.routableDataLinks,
    deletedDataLinkSystemIds,
  );
  const committedUsecasesBySubgraph = indexUsecasesBySubgraph(
    graphSnapshot.committedUsecases,
  );
  const committedUsecasesByPair = indexUsecasesByPair(
    graphSnapshot.committedUsecases,
  );
  classifyUsecasesByDeletedSubgraphs(
    sessionEdits.deletedSgs,
    committedUsecasesBySubgraph,
    ucMarkedForDeletionBySystemId,
  );
  classifyDeletedDataLinks(
    sessionEdits.deletedDataLinks,
    survivingDataLinkPairKeys,
    survivingControlLinkPairKeys,
    committedUsecasesByPair,
    islandUseCaseCandidatesBySystemId,
    ucMarkedForDeletionBySystemId,
    routableDataLinkAdjacency,
    effectiveRoutingScopeSubgraphIds,
    mdfSubgraphSystemIds,
  );
  classifyDeletedControlLinks(
    sessionEdits.deletedControlLinks,
    survivingDataLinkPairKeys,
    survivingControlLinkPairKeys,
    committedUsecasesByPair,
    ucMarkedForDeletionBySystemId,
  );
  const affectedUsecaseSystemIds = new Set(
    sortedIds([
      ...new Set([
        ...ucMarkedForDeletionBySystemId.keys(),
        ...islandUseCaseCandidatesBySystemId.keys(),
      ]),
    ]),
  );
  return {
    deletedSubgraphSystemIds,
    deletedDataLinkSystemIds,
    deletedControlLinkSystemIds,
    survivingDataLinkPairKeys,
    survivingControlLinkPairKeys,
    ucMarkedForDeletionBySystemId,
    islandUseCaseCandidatesBySystemId,
    effectiveRoutingScopeSubgraphIds,
    routableDataLinkAdjacency,
    mdfSubgraphSystemIds,
    affectedUsecaseSystemIds,
  };
}

function validateGates(
  context: RoutingContext,
  inventory: ImpactInventory,
): ReturnType<typeof Result.fail<void>> | null {
  // Gate ordering is part of the client contract: first reveal the complete affected-UC
  // set, then validate deletion-side scope closure on the client's retry.
  const selectedUsecaseSystemIds = new Set(
    context.input.selectedUsecases.map(usecase => usecase.systemId),
  );
  const missingUsecaseSystemIds = new Set(
    [...inventory.affectedUsecaseSystemIds].filter(
      systemId => !selectedUsecaseSystemIds.has(systemId),
    ),
  );
  if (missingUsecaseSystemIds.size > 0) {
    return Result.fail<void>(
      RoutingIssueFactory.deletionSelectionRequired(
        inventory.affectedUsecaseSystemIds,
        missingUsecaseSystemIds,
      ),
    );
  }
  const sessionEdits = context.input.graphSnapshot.sessionEdits;
  const conflicts = buildDeletionSideConflicts(
    context,
    inventory.deletedSubgraphSystemIds,
    sessionEdits.deletedDataLinks,
    sessionEdits.deletedControlLinks,
  );
  if (hasAnyValues(conflicts)) {
    return Result.fail<void>(RoutingIssueFactory.editScopeConflict(conflicts));
  }
  return null;
}

interface LegacyEcBoundary {
  readonly pairKey: string;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

function legacyEcBoundaries(
  context: RoutingContext,
  usecase: UseCase,
): readonly LegacyEcBoundary[] {
  if (usecase.type !== 'EC' || usecase.subgraphSystemIds.length <= 2) {
    return [];
  }
  const usecasePairKeys = new Set(
    usecase.subgraphPairs.map(pair =>
      unorderedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
  const snapshot = context.input.graphSnapshot;
  const boundaries = new Map<string, LegacyEcBoundary>();
  for (const dataLink of [
    ...snapshot.overlayDataLinks,
    ...snapshot.routableDataLinks,
    ...snapshot.sessionEdits.deletedDataLinks,
  ]) {
    const pairKey = unorderedPairKey(
      dataLink.sourceSubgraphSystemId,
      dataLink.destSubgraphSystemId,
    );
    if (dataLink.isEc === true && usecasePairKeys.has(pairKey)) {
      boundaries.set(pairKey, {
        pairKey,
        sourceSubgraphSystemId: dataLink.sourceSubgraphSystemId,
        destSubgraphSystemId: dataLink.destSubgraphSystemId,
      });
    }
  }
  return [...boundaries.values()].sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
}

function canonicalSgkvValues(valueSystemIds: readonly number[]): string | null {
  if (valueSystemIds.length === 0) return null;
  return [...new Set(valueSystemIds)]
    .sort((left, right) => left - right)
    .join(',');
}

function sameCanonicalSgkvSets(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function requestedSgkvSet(
  context: RoutingContext,
  subgraphSystemId: number,
): ReadonlySet<string> | null {
  const routingSubgraph = context.input.graphSnapshot.subgraphs.find(
    candidate => candidate.subgraph.systemId === subgraphSystemId,
  );
  if (routingSubgraph === undefined) return null;
  const values = new Set<string>();
  for (const requestedSgkv of routingSubgraph.requestedSgkvs) {
    const canonical = canonicalSgkvValues(requestedSgkv);
    if (canonical !== null) values.add(canonical);
  }
  return values;
}

function filteredBaselineSgkvSet(
  entries: readonly SgkvEntry[],
  selectedValueSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  const values = new Set<string>();
  for (const entry of entries) {
    // Value-definition system IDs are globally unique, so filtering by selected
    // value IDs is equivalent to filtering the corresponding key/value pairs.
    const canonical = canonicalSgkvValues(
      entry.keyValues
        .filter(keyValue =>
          selectedValueSystemIds.has(keyValue.valueDefSystemId),
        )
        .map(keyValue => keyValue.valueDefSystemId),
    );
    if (canonical !== null) values.add(canonical);
  }
  return values;
}

function selectedValueSystemIds(
  context: RoutingContext,
  ucDeletionMarks: readonly UsecaseDeletionMark[],
): ReadonlySet<number> {
  const markedUsecaseSystemIds = new Set(
    ucDeletionMarks.map(mark => mark.usecase.systemId),
  );
  return new Set(
    context.input.selectedUsecases
      .filter(usecase => !markedUsecaseSystemIds.has(usecase.systemId))
      .flatMap(usecase => usecase.keyVector.valueSystemIds),
  );
}

function indexSgkvsBySubgraph(
  entries: readonly SgkvEntry[],
): ReadonlyMap<number, readonly SgkvEntry[]> {
  const bySubgraph = new Map<number, SgkvEntry[]>();
  for (const entry of entries) {
    const current = bySubgraph.get(entry.sgSystemId) ?? [];
    current.push(entry);
    bySubgraph.set(entry.sgSystemId, current);
  }
  return bySubgraph;
}

function legacyEcBoundaryPairKeys(
  context: RoutingContext,
  usecase: UseCase,
  sgkvsBySubgraph: ReadonlyMap<number, readonly SgkvEntry[]>,
  selectedValues: ReadonlySet<number>,
): ReadonlySet<string> {
  const boundaries = legacyEcBoundaries(context, usecase);
  if (boundaries.length === 0) return new Set();

  const blockedPairKeys = new Set<string>();
  for (const boundary of boundaries) {
    const sourceRequested = requestedSgkvSet(
      context,
      boundary.sourceSubgraphSystemId,
    );
    const destRequested = requestedSgkvSet(
      context,
      boundary.destSubgraphSystemId,
    );
    // A missing active endpoint is invalid for reconstruction. Keep its EC
    // boundary closed rather than treating unknown SGKV state as unchanged.
    if (sourceRequested === null || destRequested === null) {
      blockedPairKeys.add(boundary.pairKey);
      continue;
    }
    const sourceBaseline = filteredBaselineSgkvSet(
      sgkvsBySubgraph.get(boundary.sourceSubgraphSystemId) ?? [],
      selectedValues,
    );
    const destBaseline = filteredBaselineSgkvSet(
      sgkvsBySubgraph.get(boundary.destSubgraphSystemId) ?? [],
      selectedValues,
    );
    if (
      !sameCanonicalSgkvSets(sourceRequested, sourceBaseline) ||
      !sameCanonicalSgkvSets(destRequested, destBaseline)
    ) {
      blockedPairKeys.add(boundary.pairKey);
    }
  }
  return blockedPairKeys;
}

function processMarkedUsecase(
  context: RoutingContext,
  mark: UsecaseDeletionMark,
  inventory: ImpactInventory,
  preservedUsecases: DeletionPreservedUsecase[],
  reconstructionPaths: DeletionReconstructionPath[],
  sgkvsBySubgraph: ReadonlyMap<number, readonly SgkvEntry[]>,
  selectedValues: ReadonlySet<number>,
): void {
  const topology = classifyStoredTopology(mark.usecase);
  if (topology.kind === 'multi-path') {
    // Multi-path UCs may lose isolated members, but auto-routing must not invent a new
    // topology. Preserve only when every stored pair remains supported.
    const hasBrokenPair = mark.usecase.subgraphPairs.some(
      pair =>
        !endpointsSurvive(
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
          inventory.deletedSubgraphSystemIds,
        ) ||
        !hasPairSupport(
          pair,
          inventory.survivingDataLinkPairKeys,
          inventory.survivingControlLinkPairKeys,
        ),
    );
    if (hasBrokenPair) {
      // The mark's deleted component is the user-facing cause. Multi-path topology is
      // internal: it only determines that automatic reconstruction is not attempted.
    } else {
      inventory.ucMarkedForDeletionBySystemId.delete(mark.usecase.systemId);
      preservedUsecases.push({
        usecase: mark.usecase,
        droppedSubgraphSystemIds: mark.usecase.subgraphSystemIds.filter(
          systemId => inventory.deletedSubgraphSystemIds.has(systemId),
        ),
      });
    }
    return;
  }

  const startSubgraphSystemId = topology.startSubgraphSystemId;
  const endSubgraphSystemId = topology.endSubgraphSystemId;
  if (
    startSubgraphSystemId === undefined ||
    endSubgraphSystemId === undefined ||
    !endpointsSurvive(
      startSubgraphSystemId,
      endSubgraphSystemId,
      inventory.deletedSubgraphSystemIds,
    )
  ) {
    // The original deleted component remains the mark's cause; endpoint loss prevents
    // reconstruction but is not an additional user-facing deletion reason.
    return;
  }

  const blockedEcPairKeys = legacyEcBoundaryPairKeys(
    context,
    mark.usecase,
    sgkvsBySubgraph,
    selectedValues,
  );
  const allowEdge =
    blockedEcPairKeys.size === 0
      ? undefined
      : (sourceSubgraphSystemId: number, edge: DirectedAdjacencyEdge) =>
          !(
            edge.isEc &&
            blockedEcPairKeys.has(
              unorderedPairKey(
                sourceSubgraphSystemId,
                edge.destSubgraphSystemId,
              ),
            )
          );
  const paths = boundedSimplePaths(
    inventory.routableDataLinkAdjacency,
    startSubgraphSystemId,
    endSubgraphSystemId,
    inventory.effectiveRoutingScopeSubgraphIds,
    Math.max(inventory.effectiveRoutingScopeSubgraphIds.size, 1),
    undefined,
    allowEdge,
  );
  if (paths.length === 0) {
    // The original deleted component remains the mark's cause; reconstruction failure
    // is internal to Phase 2 and does not alter the deletion descriptor.
    return;
  }
  for (const path of paths) {
    reconstructionPaths.push({
      originalUsecaseSystemId: mark.usecase.systemId,
      path: {subgraphSystemIds: path},
    });
  }
}

function buildIslandCandidates(
  context: RoutingContext,
  inventory: ImpactInventory,
): readonly IslandUseCaseCandidate[] {
  // A UC with both a broken pair and a degradable pair follows deletion, so deletion marks
  // are filtered before candidates and warnings are published.
  const candidates: IslandUseCaseCandidate[] = [];
  for (const candidate of [
    ...inventory.islandUseCaseCandidatesBySystemId.values(),
  ].sort((left, right) => left.usecase.systemId - right.usecase.systemId)) {
    if (
      inventory.ucMarkedForDeletionBySystemId.has(candidate.usecase.systemId)
    ) {
      continue;
    }
    const dataLinkLossPairs = [...candidate.dataLinkLossPairs.values()].sort(
      (left, right) =>
        left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
        left.destSubgraphSystemId - right.destSubgraphSystemId ||
        left.deletedDataLinkSystemId - right.deletedDataLinkSystemId,
    );
    candidates.push({usecase: candidate.usecase, dataLinkLossPairs});
    context.warnings.push(
      RoutingIssueFactory.usecaseAutoIsland(
        candidate.usecase.systemId,
        dataLinkLossPairs,
      ),
    );
  }
  return candidates;
}

async function buildAutomaticAnalysis(
  context: RoutingContext,
  inventory: ImpactInventory,
  uow: UnitOfWork,
): Promise<void> {
  // Build the complete draft first. Publishing happens once so later phases never observe
  // partially processed deletion state.
  const preservedUsecases: DeletionPreservedUsecase[] = [];
  const reconstructionPaths: DeletionReconstructionPath[] = [];
  const ucDeletionMarks = [
    ...inventory.ucMarkedForDeletionBySystemId.values(),
  ].sort((left, right) => left.usecase.systemId - right.usecase.systemId);
  const legacyEcEndpointSystemIds = sortedIds([
    ...new Set(
      ucDeletionMarks.flatMap(mark =>
        legacyEcBoundaries(context, mark.usecase).flatMap(boundary => [
          boundary.sourceSubgraphSystemId,
          boundary.destSubgraphSystemId,
        ]),
      ),
    ),
  ]);
  const sgkvs =
    legacyEcEndpointSystemIds.length === 0
      ? []
      : await uow
          .getSubgraphRepository()
          .getSgkvs(context.input.fileSystemId, legacyEcEndpointSystemIds);
  const sgkvsBySubgraph = indexSgkvsBySubgraph(sgkvs);
  const selectedValues = selectedValueSystemIds(context, ucDeletionMarks);
  for (const mark of ucDeletionMarks) {
    processMarkedUsecase(
      context,
      mark,
      inventory,
      preservedUsecases,
      reconstructionPaths,
      sgkvsBySubgraph,
      selectedValues,
    );
  }
  context.deletionAnalysis = {
    affectedUsecaseSystemIds: inventory.affectedUsecaseSystemIds,
    markedForDeletion: sortedByUseCaseSystemId(
      inventory.ucMarkedForDeletionBySystemId.values(),
    ),
    preservedUsecases: sortedByUseCaseSystemId(preservedUsecases),
    islandUseCaseCandidates: buildIslandCandidates(context, inventory),
    reconstructionPaths,
  };
}

function sortedByUseCaseSystemId<T extends {readonly usecase: UseCase}>(
  items: Iterable<T>,
): T[] {
  return [...items].sort(
    (left, right) => left.usecase.systemId - right.usecase.systemId,
  );
}

export class DeletionScopeService implements RoutingPhase {
  run(
    context: RoutingContext,
    _uow: UnitOfWork,
  ): Promise<ReturnType<typeof Result.ok<void>>> {
    // Phase 2 reads no graph topology or UC catalog after snapshot construction. Legacy
    // EC Rule B makes one bounded SGKV baseline lookup through this request's UoW.
    const inventory = buildImpactInventory(context);
    const gateFailure = validateGates(context, inventory);
    if (gateFailure) return Promise.resolve(gateFailure);
    if (context.input.mode === ROUTING_MODE.Manual) {
      // Manual routing still discovers impact and enforces both gates, but never emits
      // automatic reconstruction, degradation, or existing-UC mutation descriptors.
      context.deletionAnalysis = emptyDeletionAnalysis(
        inventory.affectedUsecaseSystemIds,
      );
      return Promise.resolve(Result.ok());
    }
    return buildAutomaticAnalysis(context, inventory, _uow).then(() =>
      Result.ok(),
    );
  }
}
