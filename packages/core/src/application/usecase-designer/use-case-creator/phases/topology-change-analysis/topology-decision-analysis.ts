/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DELETED_COMPONENT_TYPE,
  USECASE_TOPOLOGY_DECISION_KIND,
} from '../../contracts/routing-state.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingGraphSnapshot} from '../../contracts/routing-input.js';
import type {
  DataLinkLossPair,
  DeletedComponent,
  DeletedComponentType,
  MdfPairSubstitution,
  MdfSubstitutionDecision,
  TopologyChangeAnalysis,
  TransitionToIslandDecision,
  UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {
  buildTopologyImpactInventory,
  directedPairKey,
  sortedBySystemId,
  sortedIds,
  unorderedPairKey,
  type DirectedEdge,
  type TopologyImpactInventory,
} from './topology-impact-inventory.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import {MdfSubstitutionAnalyzer} from './mdf-substitution-analyzer.js';
import {computeUsecaseTypeFromPairSupport} from '../../shared/usecase-type-classifier.js';

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
  graphSnapshot: RoutingGraphSnapshot,
  mdfSubstitutionAnalyzer: MdfSubstitutionAnalyzer,
): ImpactInventory {
  // This is the only inventory-building pass. Everything below consumes the immutable
  // snapshot and keeps its indexes local to Phase 2.
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
 */ function deletedComponentPriority(component: DeletedComponent): number {
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
export interface TopologyDecisionAnalysisResult {
  readonly inventory: ImpactInventory;
  readonly analysis: TopologyChangeAnalysis;
}

export function analyzeTopologyChanges(
  snapshot: RoutingGraphSnapshot,
  mdfSubstitutionAnalyzer: MdfSubstitutionAnalyzer,
): TopologyDecisionAnalysisResult {
  const inventory = buildImpactInventory(snapshot, mdfSubstitutionAnalyzer);
  return {
    inventory,
    analysis: buildAnalysis(inventory),
  };
}
