/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import {
  DELETED_COMPONENT_TYPE,
  USECASE_TOPOLOGY_DECISION_KIND,
} from '../contracts/routing-state.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphRepository} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {
  DataLinkLossPair,
  DeletedComponent,
  DeletedComponentType,
  MdfPairSubstitution,
  MdfSubstitutionDecision,
  TopologyChangeAnalysis,
  TransitionToIslandDecision,
  UsecaseTopologyDecision,
} from '../contracts/routing-state.js';
import type {
  DirectedEdge,
  TopologyImpactInventory,
} from '../contracts/topology-impact-inventory.js';
import type {RoutingGraphSnapshot} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import {DeletionReconstructionService} from '../services/deletion-reconstruction.service.js';
import {ManualMdfPrecedenceService} from '../services/manual-mdf-precedence.service.js';
import {MdfSubstitutionAnalyzer} from '../services/mdf-substitution-analyzer.js';
import {computeUsecaseTypeFromPairSupport} from '../shared/usecase-type-classifier.js';

const STORED_TOPOLOGY_KIND = {
  SinglePath: 'single-path',
  MultiPath: 'multi-path',
} as const;

/** Closed vocabulary for the committed-UC topology shapes relevant to deletion handling. */
type StoredTopologyKind =
  (typeof STORED_TOPOLOGY_KIND)[keyof typeof STORED_TOPOLOGY_KIND];

/** Coarse committed-UC shape used only to decide whether automatic reconstruction is safe. */
interface StoredTopology {
  readonly kind: StoredTopologyKind;
  readonly startSubgraphSystemId?: number;
  readonly endSubgraphSystemId?: number;
}

/** Provisional ordinary impact retained until MDF and preservation rules are finalized. */
interface DeletionMarkDraft {
  readonly usecase: UseCase;
  readonly deletedComponent: DeletedComponent;
}

/** Safe multi-path retention discovered while resolving provisional deletion marks. */
interface PreservedUsecaseDraft {
  readonly usecase: UseCase;
  readonly droppedSubgraphSystemIds: readonly number[];
}

/** Mutable per-UC collector that deduplicates data-link losses during inventory building. */
interface IslandCandidateAccumulator {
  readonly usecase: UseCase;
  readonly dataLinkLossPairs: Map<string, DataLinkLossPair>;
}

/** Selection-closure violations collected before publishing any Phase 2 state. */
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
  const low = Math.min(sourceSubgraphSystemId, destSubgraphSystemId);
  const high = Math.max(sourceSubgraphSystemId, destSubgraphSystemId);
  return `${low}<->${high}`;
}

function directedPairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}->${destSubgraphSystemId}`;
}

function sortedBySystemId<T extends {readonly systemId: number}>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => left.systemId - right.systemId);
}

function sortedIds(ids: readonly number[]): number[] {
  return [...ids].sort((left, right) => left - right);
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
  return new Map(
    [...index.entries()]
      .sort(([left], [right]) => left - right)
      .map(([key, values]) => [
        key,
        [...values].sort((left, right) => left.systemId - right.systemId),
      ]),
  );
}

function indexLinksByPair(
  links: readonly (DataLink | ControlLink)[],
  deletedSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  // Overlay links describe file-wide surviving support. Request-only exclusions are
  // deliberately absent here because they must not create a false deletion impact.
  const pairs = new Set<string>();
  for (const link of sortedBySystemId(links)) {
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
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
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
      kind: STORED_TOPOLOGY_KIND.SinglePath,
      startSubgraphSystemId: starts[0],
      endSubgraphSystemId: ends[0],
    };
  }
  return {kind: STORED_TOPOLOGY_KIND.MultiPath};
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
): ReadonlyMap<number, readonly DirectedEdge[]> {
  // Reconstruction uses the already-filtered routable snapshot, not the overlay catalog.
  // The EC flag is retained so legacy EC boundaries can be opened or guarded per UC.
  const adjacencyBySourceSubgraphId = new Map<
    number,
    Map<string, DirectedEdge>
  >();
  for (const link of sortedBySystemId(dataLinks)) {
    if (deletedDataLinkSystemIds.has(link.systemId)) continue;
    const destinations =
      adjacencyBySourceSubgraphId.get(link.sourceSubgraphSystemId) ??
      new Map<string, DirectedEdge>();
    const isEc = link.linkType === DATA_LINK_TYPE.Ec;
    destinations.set(`${link.destSubgraphSystemId}:${Number(isEc)}`, {
      destSubgraphSystemId: link.destSubgraphSystemId,
      isEc,
    });
    adjacencyBySourceSubgraphId.set(link.sourceSubgraphSystemId, destinations);
  }
  return new Map(
    [...adjacencyBySourceSubgraphId.entries()].map(([source, destinations]) => [
      source,
      [...destinations.values()].sort(
        (left, right) =>
          left.destSubgraphSystemId - right.destSubgraphSystemId ||
          Number(left.isEc) - Number(right.isEc),
      ),
    ]),
  );
}

function indexCommittedUsecasesByDirectedPair(
  usecases: readonly UseCase[],
): ReadonlyMap<string, readonly UseCase[]> {
  const index = new Map<string, UseCase[]>();
  for (const usecase of sortedBySystemId(usecases)) {
    for (const pair of usecase.subgraphPairs) {
      const key = directedPairKey(
        pair.sourceSubgraphSystemId,
        pair.destSubgraphSystemId,
      );
      const entries = index.get(key) ?? [];
      entries.push(usecase);
      index.set(key, entries);
    }
  }
  return new Map(
    [...index.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, {numeric: true}),
      )
      .map(([key, values]) => [
        key,
        [...values].sort((left, right) => left.systemId - right.systemId),
      ]),
  );
}

/**
 * Builds the immutable Phase 2 lookup view from the handler-created graph snapshot.
 * Full overlay links establish physical pair support; request-scoped routable links
 * establish paths that this routing request may actually use.
 */
export function buildTopologyImpactInventory(
  snapshot: RoutingGraphSnapshot,
): TopologyImpactInventory {
  const deletedSubgraphSystemIds = new Set(
    sortedIds(
      snapshot.sessionEdits.deletedSgs.map(subgraph => subgraph.systemId),
    ),
  );
  const deletedDataLinkSystemIds = new Set(
    snapshot.sessionEdits.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    snapshot.sessionEdits.deletedControlLinks.map(link => link.systemId),
  );
  const committedUsecasesBySubgraph = indexUsecasesBySubgraph(
    snapshot.committedUsecases,
  );
  const adjacency = buildDirectedAdjacency(
    snapshot.routableDataLinks,
    deletedDataLinkSystemIds,
  );
  const routingSubgraphsById = new Map(
    [...snapshot.subgraphs]
      .sort((left, right) => left.subgraph.systemId - right.subgraph.systemId)
      .map(item => [item.subgraph.systemId, item] as const),
  );
  return {
    committedUsecasesByDirectedPair: indexCommittedUsecasesByDirectedPair(
      snapshot.committedUsecases,
    ),
    committedUsecasesBySubgraph,
    deletedDataLinks: sortedBySystemId(snapshot.sessionEdits.deletedDataLinks),
    deletedControlLinks: sortedBySystemId(
      snapshot.sessionEdits.deletedControlLinks,
    ),
    deletedSubgraphSystemIds,
    survivingDataLinkPairKeys: indexLinksByPair(
      snapshot.overlayDataLinks,
      deletedDataLinkSystemIds,
    ),
    survivingControlLinkPairKeys: indexLinksByPair(
      snapshot.overlayControlLinks,
      deletedControlLinkSystemIds,
    ),
    routableAdjacency: new Map(
      [...adjacency.entries()].sort(([left], [right]) => left - right),
    ) as ReadonlyMap<number, readonly DirectedEdge[]>,
    routingSubgraphsById,
  };
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
  // FR-API-07 closure is evaluated against the caller's selection after DEL-02. Deleted
  // control-link endpoints are intentionally excluded because control links do not expand
  // automatic routing scope.
  const {selection} = context.input;
  const requestedSubgraphSystemIds = new Set(
    selection.activeSubgraphs.map(subgraph => subgraph.systemId),
  );
  const explicitlyExcludedSubgraphSystemIds = new Set(
    selection.excludedSubgraphSystemIds,
  );
  const explicitlyExcludedDataLinkSystemIds = new Set(
    selection.excludedDataLinkSystemIds,
  );
  const explicitlyExcludedControlLinkSystemIds = new Set(
    selection.excludedControlLinkSystemIds,
  );
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
    systemId => explicitlyExcludedSubgraphSystemIds.has(systemId),
  );
  const deletedDataLinkSystemIds = new Set(
    deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    deletedControlLinks.map(link => link.systemId),
  );
  const excludedDeletedDataLinkSystemIds = [...deletedDataLinkSystemIds].filter(
    systemId => explicitlyExcludedDataLinkSystemIds.has(systemId),
  );
  const excludedDeletedControlLinkSystemIds = [
    ...deletedControlLinkSystemIds,
  ].filter(systemId => explicitlyExcludedControlLinkSystemIds.has(systemId));
  const missingSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId => !requestedSubgraphSystemIds.has(systemId));
  const excludedSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId => explicitlyExcludedSubgraphSystemIds.has(systemId));

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

function buildTopologyChangeAnalysis(
  affectedUsecaseSystemIds: ReadonlySet<number>,
  mdfDecisions: readonly MdfSubstitutionDecision[],
  markedForDeletion: readonly DeletionMarkDraft[],
  preservedUsecases: readonly PreservedUsecaseDraft[],
  transitionToIslandDecisions: readonly TransitionToIslandDecision[],
): TopologyChangeAnalysis {
  const decisions: UsecaseTopologyDecision[] = [
    ...mdfDecisions,
    ...markedForDeletion.map(mark => ({
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: mark.usecase,
      deletedComponent: mark.deletedComponent,
      // DeletionReconstructionService owns path discovery after selection gates pass.
      reconstructionPaths: [],
    })),
    ...preservedUsecases.map(preserved => ({
      kind: USECASE_TOPOLOGY_DECISION_KIND.Preserve,
      usecase: preserved.usecase,
      droppedSubgraphSystemIds: preserved.droppedSubgraphSystemIds,
    })),
    ...transitionToIslandDecisions,
  ];

  return {
    affectedUsecaseSystemIds,
    decisions: [...decisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    ),
  };
}

/** Mutable Phase 2 working set that aggregates all committed-UC topology impacts. */
interface ImpactInventory {
  readonly topology: TopologyImpactInventory;
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly deletedDataLinkSystemIds: ReadonlySet<number>;
  readonly deletedControlLinkSystemIds: ReadonlySet<number>;
  readonly survivingDataLinkPairKeys: ReadonlySet<string>;
  readonly survivingControlLinkPairKeys: ReadonlySet<string>;
  readonly ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>;
  readonly islandUseCaseCandidatesBySystemId: Map<
    number,
    IslandCandidateAccumulator
  >;
  readonly mdfSubstitutionsByUsecaseSystemId: Map<
    number,
    readonly MdfPairSubstitution[]
  >;
  readonly mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId: ReadonlyMap<
    number,
    ReadonlySet<number>
  >;
  readonly unsupportedDataLinkSystemIdsByUsecaseSystemId: ReadonlyMap<
    number,
    ReadonlySet<number>
  >;
  readonly unsupportedControlLinkSystemIdsByUsecaseSystemId: ReadonlyMap<
    number,
    ReadonlySet<number>
  >;
  readonly deletedSubgraphSystemIdsByUsecaseSystemId: ReadonlyMap<
    number,
    ReadonlySet<number>
  >;
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
}

function addIslandCandidate(
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateAccumulator>,
  usecase: UseCase,
  dataLink: DataLink,
  pairKey: string,
): void {
  // Merge losses by UC so one warning and one candidate describe all affected pairs.
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
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
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
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateAccumulator>,
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
): void {
  const pairKey = unorderedPairKey(
    dataLink.sourceSubgraphSystemId,
    dataLink.destSubgraphSystemId,
  );
  const directedPair = directedPairKey(
    dataLink.sourceSubgraphSystemId,
    dataLink.destSubgraphSystemId,
  );
  if (survivingDataLinkPairKeys.has(pairKey)) return;
  const pairUsecases = committedUsecasesByPair.get(directedPair) ?? [];
  if (survivingControlLinkPairKeys.has(pairKey)) {
    // Only LINKED UCs need an automatic LINKED -> ISLAND candidate. Existing ISLAND UCs
    // already represent this control-link-supported state.
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
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateAccumulator>,
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
): void {
  for (const dataLink of sortedBySystemId(deletedDataLinks)) {
    classifyDeletedDataLink(
      dataLink,
      survivingDataLinkPairKeys,
      survivingControlLinkPairKeys,
      committedUsecasesByPair,
      islandUseCaseCandidatesBySystemId,
      ucMarkedForDeletionBySystemId,
    );
  }
}

function classifyDeletedControlLinks(
  deletedControlLinks: readonly ControlLink[],
  survivingDataLinkPairKeys: ReadonlySet<string>,
  survivingControlLinkPairKeys: ReadonlySet<string>,
  committedUsecasesByPair: ReadonlyMap<string, readonly UseCase[]>,
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
): void {
  for (const controlLink of sortedBySystemId(deletedControlLinks)) {
    const pairKey = unorderedPairKey(
      controlLink.sourceSubgraphSystemId,
      controlLink.destSubgraphSystemId,
    );
    const directedPair = directedPairKey(
      controlLink.sourceSubgraphSystemId,
      controlLink.destSubgraphSystemId,
    );
    if (
      survivingDataLinkPairKeys.has(pairKey) ||
      survivingControlLinkPairKeys.has(pairKey)
    ) {
      continue;
    }
    for (const usecase of committedUsecasesByPair.get(directedPair) ?? []) {
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

function buildImpactInventory(
  context: RoutingContext,
  mdfSubstitutionAnalyzer: MdfSubstitutionAnalyzer,
): ImpactInventory {
  // This is the only inventory-building pass. Everything below consumes the immutable
  // snapshot and keeps its indexes local to Phase 2.
  const {graphSnapshot} = context.input;
  const {sessionEdits} = graphSnapshot;
  const topology = buildTopologyImpactInventory(graphSnapshot);
  const deletedSubgraphSystemIds = topology.deletedSubgraphSystemIds;
  const deletedDataLinkSystemIds = new Set(
    sessionEdits.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    sessionEdits.deletedControlLinks.map(link => link.systemId),
  );
  const survivingDataLinkPairKeys = topology.survivingDataLinkPairKeys;
  const survivingControlLinkPairKeys = topology.survivingControlLinkPairKeys;
  const ucMarkedForDeletionBySystemId = new Map<number, DeletionMarkDraft>();
  const islandUseCaseCandidatesBySystemId = new Map<
    number,
    IslandCandidateAccumulator
  >();
  const mdfSubstitutionsByUsecaseSystemId = new Map<
    number,
    MdfPairSubstitution[]
  >();
  const mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId = new Map<
    number,
    Set<number>
  >();
  const committedUsecasesBySubgraph = topology.committedUsecasesBySubgraph;
  const committedUsecasesByPair = topology.committedUsecasesByDirectedPair;

  // Classify ordinary deletion impact first. MDF analysis may later replace a compatible
  // data-link deletion, but only after validating the complete affected UseCase.
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
  );
  classifyDeletedControlLinks(
    sessionEdits.deletedControlLinks,
    survivingDataLinkPairKeys,
    survivingControlLinkPairKeys,
    committedUsecasesByPair,
    ucMarkedForDeletionBySystemId,
  );

  // These are provisional per-link substitutions. They are grouped by UseCase and
  // finalized together below, preventing a partial direct update for mixed impact.
  for (const dataLink of topology.deletedDataLinks) {
    const substitution = mdfSubstitutionAnalyzer.analyze(dataLink, topology);
    if (substitution === null) continue;
    const pairKey = directedPairKey(
      dataLink.sourceSubgraphSystemId,
      dataLink.destSubgraphSystemId,
    );
    for (const usecase of committedUsecasesByPair.get(pairKey) ?? []) {
      const substitutions =
        mdfSubstitutionsByUsecaseSystemId.get(usecase.systemId) ?? [];
      if (usecase.type === 'EC' && dataLink.linkType !== DATA_LINK_TYPE.Ec)
        continue;
      substitutions.push(substitution);
      mdfSubstitutionsByUsecaseSystemId.set(usecase.systemId, substitutions);
      const dataLinkSystemIds =
        mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId.get(
          usecase.systemId,
        ) ?? new Set<number>();
      dataLinkSystemIds.add(dataLink.systemId);
      mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId.set(
        usecase.systemId,
        dataLinkSystemIds,
      );
    }
  }
  const unsupportedDataLinkSystemIdsByUsecaseSystemId =
    buildUnsupportedDataLinkIndex(topology);
  const unsupportedControlLinkSystemIdsByUsecaseSystemId =
    buildUnsupportedControlLinkIndex(topology);
  const deletedSubgraphSystemIdsByUsecaseSystemId =
    buildDeletedSubgraphIndex(topology);
  const affectedUsecaseSystemIds = new Set(
    sortedIds([
      ...new Set([
        ...ucMarkedForDeletionBySystemId.keys(),
        ...islandUseCaseCandidatesBySystemId.keys(),
      ]),
    ]),
  );
  return {
    topology,
    deletedSubgraphSystemIds,
    deletedDataLinkSystemIds,
    deletedControlLinkSystemIds,
    survivingDataLinkPairKeys,
    survivingControlLinkPairKeys,
    ucMarkedForDeletionBySystemId,
    islandUseCaseCandidatesBySystemId,
    mdfSubstitutionsByUsecaseSystemId,
    mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId,
    unsupportedDataLinkSystemIdsByUsecaseSystemId,
    unsupportedControlLinkSystemIdsByUsecaseSystemId,
    deletedSubgraphSystemIdsByUsecaseSystemId,
    affectedUsecaseSystemIds,
  };
}

function buildUnsupportedDataLinkIndex(
  topology: TopologyImpactInventory,
): ReadonlyMap<number, ReadonlySet<number>> {
  const index = new Map<number, Set<number>>();
  for (const dataLink of topology.deletedDataLinks) {
    const supportKey = unorderedPairKey(
      dataLink.sourceSubgraphSystemId,
      dataLink.destSubgraphSystemId,
    );
    if (
      topology.survivingDataLinkPairKeys.has(supportKey) ||
      topology.survivingControlLinkPairKeys.has(supportKey)
    ) {
      continue;
    }
    const pairUsecases = topology.committedUsecasesByDirectedPair.get(
      directedPairKey(
        dataLink.sourceSubgraphSystemId,
        dataLink.destSubgraphSystemId,
      ),
    );
    for (const usecase of pairUsecases ?? []) {
      const dataLinkSystemIds =
        index.get(usecase.systemId) ?? new Set<number>();
      dataLinkSystemIds.add(dataLink.systemId);
      index.set(usecase.systemId, dataLinkSystemIds);
    }
  }
  return index;
}

function buildUnsupportedControlLinkIndex(
  topology: TopologyImpactInventory,
): ReadonlyMap<number, ReadonlySet<number>> {
  const index = new Map<number, Set<number>>();
  for (const controlLink of topology.deletedControlLinks) {
    const supportKey = unorderedPairKey(
      controlLink.sourceSubgraphSystemId,
      controlLink.destSubgraphSystemId,
    );
    if (
      topology.survivingDataLinkPairKeys.has(supportKey) ||
      topology.survivingControlLinkPairKeys.has(supportKey)
    ) {
      continue;
    }
    const pairUsecases = topology.committedUsecasesByDirectedPair.get(
      directedPairKey(
        controlLink.sourceSubgraphSystemId,
        controlLink.destSubgraphSystemId,
      ),
    );
    for (const usecase of pairUsecases ?? []) {
      const controlLinkSystemIds =
        index.get(usecase.systemId) ?? new Set<number>();
      controlLinkSystemIds.add(controlLink.systemId);
      index.set(usecase.systemId, controlLinkSystemIds);
    }
  }
  return index;
}

function buildDeletedSubgraphIndex(
  topology: TopologyImpactInventory,
): ReadonlyMap<number, ReadonlySet<number>> {
  const index = new Map<number, Set<number>>();
  for (const subgraphSystemId of topology.deletedSubgraphSystemIds) {
    for (const usecase of topology.committedUsecasesBySubgraph.get(
      subgraphSystemId,
    ) ?? []) {
      const deletedSubgraphSystemIds =
        index.get(usecase.systemId) ?? new Set<number>();
      deletedSubgraphSystemIds.add(subgraphSystemId);
      index.set(usecase.systemId, deletedSubgraphSystemIds);
    }
  }
  return index;
}

function pairKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}->${destSubgraphSystemId}`;
}

function comparePairs(
  left: {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  },
  right: {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  },
): number {
  return (
    left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
    left.destSubgraphSystemId - right.destSubgraphSystemId
  );
}

function substitutionSignature(substitution: MdfPairSubstitution): string {
  return `${substitution.replacementSubgraphSystemIds.join(',')}|${substitution.replacementPairs
    .map(pair =>
      pairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    )
    .join(',')}`;
}

function directedPairSupport(
  pair: {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  },
  adjacency: TopologyImpactInventory['routableAdjacency'],
): readonly DirectedEdge[] {
  return (
    adjacency
      .get(pair.sourceSubgraphSystemId)
      ?.filter(
        edge => edge.destSubgraphSystemId === pair.destSubgraphSystemId,
      ) ?? []
  );
}

function replacementChainIsEc(
  substitution: MdfPairSubstitution,
  adjacency: TopologyImpactInventory['routableAdjacency'],
): boolean | null {
  let chainSemantic: boolean | undefined;
  for (const pair of substitution.replacementPairs) {
    const semantics = new Set(
      directedPairSupport(pair, adjacency).map(edge => edge.isEc),
    );
    if (semantics.size !== 1) return null;
    const [isEc] = semantics;
    if (chainSemantic !== undefined && chainSemantic !== isEc) return null;
    chainSemantic = isEc;
  }
  return chainSemantic ?? null;
}

// The aggregate validation intentionally keeps all substitution invariants in one boundary.
// eslint-disable-next-line sonarjs/cognitive-complexity
function finalizeMdfDecision(
  usecase: UseCase,
  substitutions: readonly MdfPairSubstitution[],
  inventory: ImpactInventory,
): MdfSubstitutionDecision | null {
  const substitutionsByRemovedPair = new Map<string, MdfPairSubstitution>();
  for (const substitution of substitutions) {
    const removedPairKey = pairKey(
      substitution.removedPair.sourceSubgraphSystemId,
      substitution.removedPair.destSubgraphSystemId,
    );
    const existing = substitutionsByRemovedPair.get(removedPairKey);
    if (
      existing !== undefined &&
      substitutionSignature(existing) !== substitutionSignature(substitution)
    ) {
      return null;
    }
    if (!existing) substitutionsByRemovedPair.set(removedPairKey, substitution);
  }

  const orderedSubstitutions = [...substitutionsByRemovedPair.values()].sort(
    (left, right) => comparePairs(left.removedPair, right.removedPair),
  );
  const removedPairKeys = new Set(
    orderedSubstitutions.map(substitution =>
      pairKey(
        substitution.removedPair.sourceSubgraphSystemId,
        substitution.removedPair.destSubgraphSystemId,
      ),
    ),
  );
  const committedPairKeys = new Set(
    usecase.subgraphPairs.map(pair =>
      pairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
  if (
    orderedSubstitutions.some(
      substitution =>
        !committedPairKeys.has(
          pairKey(
            substitution.removedPair.sourceSubgraphSystemId,
            substitution.removedPair.destSubgraphSystemId,
          ),
        ),
    )
  ) {
    return null;
  }

  const resultingSubgraphSystemIds = new Set(usecase.subgraphSystemIds);
  const addedPairByKey = new Map<
    string,
    {
      readonly sourceSubgraphSystemId: number;
      readonly destSubgraphSystemId: number;
    }
  >();
  for (const substitution of orderedSubstitutions) {
    for (const subgraphSystemId of substitution.replacementSubgraphSystemIds)
      resultingSubgraphSystemIds.add(subgraphSystemId);
    for (const replacementPair of substitution.replacementPairs) {
      if (
        replacementPair.sourceSubgraphSystemId ===
        replacementPair.destSubgraphSystemId
      ) {
        return null;
      }
      const replacementPairKey = pairKey(
        replacementPair.sourceSubgraphSystemId,
        replacementPair.destSubgraphSystemId,
      );
      if (removedPairKeys.has(replacementPairKey)) return null;
      addedPairByKey.set(replacementPairKey, replacementPair);
    }
  }

  for (const replacementPair of addedPairByKey.values()) {
    if (
      !resultingSubgraphSystemIds.has(replacementPair.sourceSubgraphSystemId) ||
      !resultingSubgraphSystemIds.has(replacementPair.destSubgraphSystemId)
    ) {
      return null;
    }
  }

  const resultingPairByKey = new Map<
    string,
    (typeof usecase.subgraphPairs)[number]
  >();
  for (const currentPair of usecase.subgraphPairs) {
    const currentPairKey = pairKey(
      currentPair.sourceSubgraphSystemId,
      currentPair.destSubgraphSystemId,
    );
    if (!removedPairKeys.has(currentPairKey))
      resultingPairByKey.set(currentPairKey, currentPair);
  }
  for (const [replacementPairKey, replacementPair] of addedPairByKey)
    resultingPairByKey.set(replacementPairKey, replacementPair);
  const resultingPairs = [...resultingPairByKey.values()].sort(comparePairs);
  const removedPairs = orderedSubstitutions
    .map(substitution => substitution.removedPair)
    .sort(comparePairs);
  const addedPairs = [...addedPairByKey.values()].sort(comparePairs);
  const resultingType = computeUsecaseTypeFromPairSupport(
    resultingPairs,
    pair =>
      inventory.topology.routableAdjacency
        .get(pair.sourceSubgraphSystemId)
        ?.filter(
          edge => edge.destSubgraphSystemId === pair.destSubgraphSystemId,
        ) ?? [],
  );

  const replacementPairKeys = new Set(
    orderedSubstitutions.flatMap(substitution =>
      substitution.replacementPairs.map(pair =>
        pairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
      ),
    ),
  );
  let logicalEcCrossings = 0;
  for (const substitution of orderedSubstitutions) {
    const isEc = replacementChainIsEc(
      substitution,
      inventory.topology.routableAdjacency,
    );
    if (isEc === null) return null;
    if (isEc) logicalEcCrossings += 1;
  }
  for (const pair of resultingPairs) {
    const key = pairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId);
    if (replacementPairKeys.has(key)) continue;
    if (
      directedPairSupport(pair, inventory.topology.routableAdjacency).some(
        edge => edge.isEc,
      )
    ) {
      logicalEcCrossings += 1;
    }
  }

  if (logicalEcCrossings > 1 || resultingType !== usecase.type) return null;

  const addedSubgraphSystemIds = [...resultingSubgraphSystemIds]
    .filter(id => !usecase.subgraphSystemIds.includes(id))
    .sort((left, right) => left - right);

  return {
    kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
    usecase,
    substitutions: orderedSubstitutions,
    structuralChange: {
      addedSubgraphSystemIds,
      removedSubgraphSystemIds: [],
      addedPairs,
      removedPairs,
      resultingSubgraphSystemIds: [...resultingSubgraphSystemIds].sort(
        (left, right) => left - right,
      ),
      resultingPairs,
      resultingType,
      sgkvAssignments: addedSubgraphSystemIds.map(subgraphSystemId => ({
        subgraphSystemId,
        valueDefinitionSystemIds: [],
      })),
    },
  };
}

function buildMdfDecisions(
  inventory: ImpactInventory,
): readonly MdfSubstitutionDecision[] {
  // A pure MDF update is all-or-nothing for one committed UseCase. Any ordinary deletion
  // impact keeps its deletion mark intact so the existing workflow owns the fallback.
  const decisions: MdfSubstitutionDecision[] = [];
  for (const [usecaseSystemId, substitutions] of [
    ...inventory.mdfSubstitutionsByUsecaseSystemId.entries(),
  ].sort(([left], [right]) => left - right)) {
    const mark = inventory.ucMarkedForDeletionBySystemId.get(usecaseSystemId);
    const substitutedDataLinkSystemIds =
      inventory.mdfSubstitutedDataLinkSystemIdsByUsecaseSystemId.get(
        usecaseSystemId,
      );
    const unsupportedDataLinkSystemIds =
      inventory.unsupportedDataLinkSystemIdsByUsecaseSystemId.get(
        usecaseSystemId,
      );
    if (
      mark === undefined ||
      mark.deletedComponent.type !== DELETED_COMPONENT_TYPE.DataLink ||
      substitutedDataLinkSystemIds === undefined ||
      unsupportedDataLinkSystemIds === undefined ||
      substitutedDataLinkSystemIds.size !== unsupportedDataLinkSystemIds.size ||
      [...unsupportedDataLinkSystemIds].some(
        systemId => !substitutedDataLinkSystemIds.has(systemId),
      ) ||
      (inventory.unsupportedControlLinkSystemIdsByUsecaseSystemId.get(
        usecaseSystemId,
      )?.size ?? 0) > 0 ||
      (inventory.deletedSubgraphSystemIdsByUsecaseSystemId.get(usecaseSystemId)
        ?.size ?? 0) > 0 ||
      inventory.islandUseCaseCandidatesBySystemId.has(usecaseSystemId)
    ) {
      continue;
    }
    const decision = finalizeMdfDecision(
      mark.usecase,
      substitutions,
      inventory,
    );
    if (decision === null) continue;
    inventory.ucMarkedForDeletionBySystemId.delete(usecaseSystemId);
    (inventory.affectedUsecaseSystemIds as Set<number>).delete(usecaseSystemId);
    decisions.push(decision);
  }
  return decisions;
}

function validateGates(
  context: RoutingContext,
  inventory: ImpactInventory,
  affectedUsecaseSystemIds: ReadonlySet<number>,
): ReturnType<typeof Result.fail<void>> | null {
  // Gate ordering is part of the client contract: first reveal the complete affected-UC
  // set, then validate deletion-side scope closure on the client's retry.
  const selectedUsecaseSystemIds = new Set(
    context.input.selectedUsecases.map(usecase => usecase.systemId),
  );
  const missingUsecaseSystemIds = new Set(
    [...affectedUsecaseSystemIds].filter(
      systemId => !selectedUsecaseSystemIds.has(systemId),
    ),
  );
  if (missingUsecaseSystemIds.size > 0) {
    return Result.fail<void>(
      RoutingIssueFactory.deletionSelectionRequired(
        affectedUsecaseSystemIds,
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

function processMarkedUsecase(
  mark: DeletionMarkDraft,
  inventory: ImpactInventory,
  preservedUsecases: PreservedUsecaseDraft[],
): void {
  const topology = classifyStoredTopology(mark.usecase);
  if (topology.kind === STORED_TOPOLOGY_KIND.MultiPath) {
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
  }
}

function buildTransitionToIslandDecisions(
  inventory: ImpactInventory,
  preservedUsecasesBySystemId: ReadonlyMap<number, PreservedUsecaseDraft>,
): readonly TransitionToIslandDecision[] {
  // A UC with both a broken pair and a pair eligible for island transition follows deletion,
  // so deletion marks are filtered before decisions and warnings are published.
  const decisions: TransitionToIslandDecision[] = [];
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
    decisions.push({
      kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
      usecase: candidate.usecase,
      dataLinkLossPairs,
      droppedSubgraphSystemIds:
        preservedUsecasesBySystemId.get(candidate.usecase.systemId)
          ?.droppedSubgraphSystemIds ?? [],
    });
  }
  return decisions;
}

function buildAnalysis(inventory: ImpactInventory): TopologyChangeAnalysis {
  // Build the complete draft first. Publishing happens once so later phases never observe
  // partially processed deletion state.
  const preservedUsecases: PreservedUsecaseDraft[] = [];
  const ucDeletionMarks = [
    ...inventory.ucMarkedForDeletionBySystemId.values(),
  ].sort((left, right) => left.usecase.systemId - right.usecase.systemId);
  for (const mark of ucDeletionMarks) {
    processMarkedUsecase(mark, inventory, preservedUsecases);
  }

  // Finalizing MDF decisions may remove compatible data-link marks. Do this before
  // materializing ordinary decisions so every UseCase receives one final outcome.
  const mdfDecisions = buildMdfDecisions(inventory);
  const markedForDeletion = sortedByUseCaseSystemId(
    inventory.ucMarkedForDeletionBySystemId.values(),
  );
  const preservedUsecasesBySystemId = new Map(
    preservedUsecases.map(preserved => [preserved.usecase.systemId, preserved]),
  );
  const transitionToIslandDecisions = buildTransitionToIslandDecisions(
    inventory,
    preservedUsecasesBySystemId,
  );
  const islandUsecaseSystemIds = new Set(
    transitionToIslandDecisions.map(decision => decision.usecase.systemId),
  );
  return buildTopologyChangeAnalysis(
    new Set(),
    mdfDecisions,
    markedForDeletion,
    sortedByUseCaseSystemId(
      preservedUsecases.filter(
        preserved => !islandUsecaseSystemIds.has(preserved.usecase.systemId),
      ),
    ),
    transitionToIslandDecisions,
  );
}

function deriveAffectedUsecaseSystemIds(
  decisions: readonly UsecaseTopologyDecision[],
): ReadonlySet<number> {
  // The affected set is derived only after each committed UseCase has one finalized
  // decision. It drives the existing deletion-selection gate, not the complete write set:
  //
  // - MDF_SUBSTITUTION is excluded because it is direct system-owned maintenance.
  // - PRESERVE is included when the existing FR-DEL rules require selection.
  // - TRANSITION_TO_ISLAND is included because the existing UseCase changes type.
  // - DELETE_OR_RECONSTRUCT is included because the existing UseCase is retired.
  //
  // FR-DEL-02 and deletion-side FR-API-07 retain their existing ordering and payloads.
  const affected = new Set<number>();
  for (const decision of decisions) {
    if (decision.kind === USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution)
      continue;
    affected.add(decision.usecase.systemId);
  }
  return affected;
}

function appendAutomaticIslandWarnings(
  context: RoutingContext,
  decisions: readonly UsecaseTopologyDecision[],
): void {
  for (const decision of decisions) {
    if (decision.kind !== USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland)
      continue;
    context.warnings.push(
      RoutingIssueFactory.usecaseAutoIsland(
        decision.usecase.systemId,
        decision.dataLinkLossPairs,
      ),
    );
  }
}

function sortedByUseCaseSystemId<T extends {readonly usecase: UseCase}>(
  items: Iterable<T>,
): T[] {
  return [...items].sort(
    (left, right) => left.usecase.systemId - right.usecase.systemId,
  );
}

/**
 * Owns Phase 2 committed-UseCase impact analysis.
 *
 * The service builds one inventory, aggregates deletion and MDF effects per UseCase,
 * finalizes one discriminated topology decision, applies manual-edit precedence, validates
 * selection gates, and publishes the complete result. It does not persist changes; the
 * staging phase consumes its output.
 */
export class TopologyChangeAnalysisService {
  constructor(
    private readonly deletionReconstruction = new DeletionReconstructionService(),
    private readonly manualMdfPrecedence = new ManualMdfPrecedenceService(),
    private readonly mdfSubstitutionAnalyzer = new MdfSubstitutionAnalyzer(),
  ) {}

  async run(
    context: RoutingContext,
    subgraphRepository: SubgraphRepository,
  ): Promise<ResultType<void>> {
    // Phase 2 reads no graph topology or UC catalog after snapshot construction. Legacy
    // EC Rule B makes one bounded SGKV baseline lookup through the supplied repository.
    const inventory = buildImpactInventory(
      context,
      this.mdfSubstitutionAnalyzer,
    );
    // Manual edits can already own the effective topology for an MDF replacement. Apply
    // that precedence before deriving affected UCs or validating client selection.
    const draft = this.applyManualPrecedence(context, buildAnalysis(inventory));
    const affectedUsecaseSystemIds = deriveAffectedUsecaseSystemIds(
      draft.decisions,
    );
    const gateFailure = validateGates(
      context,
      inventory,
      affectedUsecaseSystemIds,
    );
    if (gateFailure) return gateFailure;

    // Only automatic routing discovers replacement paths. Manual routing keeps the
    // deletion decision but requires the caller to provide any successor topology.
    const reconstructed = await this.reconstruct(
      context,
      inventory,
      draft,
      subgraphRepository,
    );
    if (reconstructed.kind === 'FAIL') return reconstructed;

    const finalAnalysis: TopologyChangeAnalysis = {
      affectedUsecaseSystemIds,
      decisions: reconstructed.data,
    };
    // Publish only the complete, gate-validated analysis for all later routing phases.
    context.topologyChangeAnalysis = finalAnalysis;
    if (context.input.mode === ROUTING_MODE.Auto)
      appendAutomaticIslandWarnings(context, finalAnalysis.decisions);
    return Result.ok();
  }

  private applyManualPrecedence(
    context: RoutingContext,
    analysis: TopologyChangeAnalysis,
  ): TopologyChangeAnalysis {
    // Suppression is intentionally limited to duplicate MDF maintenance. Ordinary impacts
    // remain decisions and continue through the existing deletion gate.
    return {
      ...analysis,
      decisions: this.manualMdfPrecedence.apply(
        context.input,
        analysis.decisions,
      ),
    };
  }

  private async reconstruct(
    context: RoutingContext,
    inventory: ImpactInventory,
    analysis: TopologyChangeAnalysis,
    subgraphRepository: SubgraphRepository,
  ): Promise<ResultType<readonly UsecaseTopologyDecision[]>> {
    const result = await this.deletionReconstruction.run(
      {
        input: context.input,
        inventory: inventory.topology,
        decisions: analysis.decisions,
      },
      subgraphRepository,
    );
    if (result.kind === 'FAIL') return Result.fail(...result.issues);
    return Result.ok(result.data);
  }
}
