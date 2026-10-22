/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DELETED_COMPONENT_TYPE,
  MDF_TOPOLOGY_REWRITE_KIND,
  USECASE_TOPOLOGY_DECISION_KIND,
} from '../../contracts/routing-state.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {RoutingGraphSnapshot} from '../../contracts/routing-input.js';
import type {
  DataLinkLossPair,
  DeletedComponent,
  DeletedComponentType,
  MdfNormalizationDecision,
  ControlPairRemovalDecision,
  MdfTopologyRewrite,
  TopologyChangeAnalysis,
  TransitionToIslandDecision,
  UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {
  buildTopologyImpactInventory,
  sortedBySystemId,
  type TopologyImpactInventory,
} from './topology-impact-inventory.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import {MdfExpansionAnalyzer} from './mdf-expansion-analyzer.js';
import {MdfCollapseAnalyzer} from './mdf-collapse-analyzer.js';
import {computeUsecaseTypeFromPairSupport} from '../../shared/usecase-type-classifier.js';
import {
  directedPairKey,
  unorderedPairKey,
} from '../../shared/usecase-topology.js';

/**
 * Phase 2 of routing: decide what happens to every committed UseCase (UC) touched by the
 * session's subgraph/link deletions, before any new routing is attempted.
 *
 * Reading order for this file:
 *   1. `buildImpactInventory` and its helpers classify every deleted subgraph, data-link,
 *      and control-link against committed UCs, producing provisional deletion marks and
 *      island candidates (no decisions are finalized yet).
 *   2. `collectAllRewrites` / `buildMdfNormalizationDecisions` look for MDF-only causes
 *      behind a deletion mark: if an MDF expansion/collapse fully explains the loss, the
 *      UC is normalized in place instead of deleted.
 *   3. `buildAnalysis` resolves what remains: multi-path UCs whose stored pairs still hold
 *      are preserved, LINKED UCs that lost their last data-link but kept a control-link
 *      become island-transition candidates, and everything else stays marked for deletion
 *      (handled later by DeletionReconstructionService).
 *   4. `analyzeTopologyChanges` is the single public entry point tying 1-3 together.
 */

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
  mdfDecisions: readonly MdfNormalizationDecision[],
  controlPairRemovalDecisions: readonly ControlPairRemovalDecision[],
  markedForDeletion: readonly DeletionMarkDraft[],
  preservedUsecases: readonly PreservedUsecaseDraft[],
  transitionToIslandDecisions: readonly TransitionToIslandDecision[],
): TopologyChangeAnalysis {
  const decisions: UsecaseTopologyDecision[] = [
    ...mdfDecisions,
    ...controlPairRemovalDecisions,
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
    // The phase caller derives and overwrites this from the merged decision list; this
    // function only owns decision assembly, not the aggregate affected-UC summary.
    affectedUsecaseSystemIds: new Set(),
    decisions: [...decisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    ),
  };
}

/**
 * Mutable Phase 2 working set that aggregates all committed-UC topology impacts.
 * `topology` carries the immutable Stage 1 snapshot (deleted/surviving sets included);
 * the two maps below are the only new state this phase originates, so they are the only
 * fields duplicated at the top level instead of read through `topology`.
 */
interface ImpactInventory {
  readonly topology: TopologyImpactInventory;
  readonly ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>;
  readonly islandUseCaseCandidatesBySystemId: Map<
    number,
    IslandCandidateAccumulator
  >;
  readonly controlPairRemovalsByUsecaseSystemId: Map<
    number,
    {
      readonly usecase: UseCase;
      readonly pairs: Map<string, SubgraphPair>;
    }
  >;
}

// --- Stage 1: impact inventory. Classify every deleted subgraph/data-link/control-link
// against committed UCs into provisional deletion marks or island candidates. ---

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
      if (usecase.type === USECASE_TYPE.Linked) {
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
  committedUsecasesByUnorderedPair: ReadonlyMap<string, readonly UseCase[]>,
  islandUseCaseCandidatesBySystemId: Map<number, IslandCandidateAccumulator>,
  controlPairRemovalsByUsecaseSystemId: Map<
    number,
    {readonly usecase: UseCase; readonly pairs: Map<string, SubgraphPair>}
  >,
  ucMarkedForDeletionBySystemId: Map<number, DeletionMarkDraft>,
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
    for (const usecase of committedUsecasesByUnorderedPair.get(pairKey) ?? []) {
      const storedPairs = usecase.subgraphPairs.filter(
        pair =>
          unorderedPairKey(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ) === pairKey,
      );
      if (
        ucMarkedForDeletionBySystemId.has(usecase.systemId) ||
        islandUseCaseCandidatesBySystemId.has(usecase.systemId)
      ) {
        markForDeletion(
          ucMarkedForDeletionBySystemId,
          usecase,
          deletedComponent(
            DELETED_COMPONENT_TYPE.ControlLink,
            controlLink.systemId,
          ),
        );
        continue;
      }
      const removal = controlPairRemovalsByUsecaseSystemId.get(
        usecase.systemId,
      ) ?? {usecase, pairs: new Map<string, SubgraphPair>()};
      for (const pair of storedPairs)
        removal.pairs.set(
          directedPairKey(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ),
          pair,
        );
      controlPairRemovalsByUsecaseSystemId.set(usecase.systemId, removal);
    }
  }
}

function buildImpactInventory(
  graphSnapshot: RoutingGraphSnapshot,
): ImpactInventory {
  // This is the only inventory-building pass. Everything below consumes the immutable
  // snapshot and keeps its indexes local to Phase 2.
  const {sessionEdits} = graphSnapshot;
  const topology = buildTopologyImpactInventory(graphSnapshot);
  const survivingDataLinkPairKeys = topology.survivingDataLinkPairKeys;
  const survivingControlLinkPairKeys = topology.survivingControlLinkPairKeys;
  const ucMarkedForDeletionBySystemId = new Map<number, DeletionMarkDraft>();
  const islandUseCaseCandidatesBySystemId = new Map<
    number,
    IslandCandidateAccumulator
  >();
  const controlPairRemovalsByUsecaseSystemId = new Map<
    number,
    {readonly usecase: UseCase; readonly pairs: Map<string, SubgraphPair>}
  >();
  const committedUsecasesBySubgraph = topology.committedUsecasesBySubgraph;
  const committedUsecasesByPair = topology.committedUsecasesByDirectedPair;
  const committedUsecasesByUnorderedPair =
    topology.committedUsecasesByUnorderedPair;

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
    committedUsecasesByUnorderedPair,
    islandUseCaseCandidatesBySystemId,
    controlPairRemovalsByUsecaseSystemId,
    ucMarkedForDeletionBySystemId,
  );

  return {
    topology,
    ucMarkedForDeletionBySystemId,
    islandUseCaseCandidatesBySystemId,
    controlPairRemovalsByUsecaseSystemId,
  };
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

// --- Stage 2: MDF normalization. Look for MDF expansion/collapse rewrites that fully
// explain a provisional deletion mark, so the UC is normalized in place instead of deleted.
// `collectAllRewrites` gathers every candidate rewrite per UC; `buildMdfNormalizationDecisions`
// then validates each UC's rewrite set as a whole and turns the survivors into decisions. ---

// Cognitive complexity is inherent: every deleted data-link and every deleted MDF member
// must be checked against both rewrite analyzers, and the two loops cannot be merged because
// collapse analysis needs the complete per-UC rewrite set from the expansion loop above it.
// eslint-disable-next-line sonarjs/cognitive-complexity
function collectAllRewrites(
  inventory: ImpactInventory,
  mdfExpansionAnalyzer: MdfExpansionAnalyzer,
  mdfCollapseAnalyzer: MdfCollapseAnalyzer,
): Map<number, MdfTopologyRewrite[]> {
  const rewritesByUsecaseSystemId = new Map<number, MdfTopologyRewrite[]>();

  for (const dataLink of inventory.topology.deletedDataLinks) {
    const rewrite = mdfExpansionAnalyzer.analyze(dataLink, inventory.topology);
    if (rewrite === null) continue;
    const usecases =
      inventory.topology.committedUsecasesByDirectedPair.get(
        directedPairKey(
          dataLink.sourceSubgraphSystemId,
          dataLink.destSubgraphSystemId,
        ),
      ) ?? [];
    for (const usecase of usecases) {
      if (
        usecase.type === USECASE_TYPE.Ec &&
        dataLink.linkType !== DATA_LINK_TYPE.Ec
      )
        continue;
      const rewrites = rewritesByUsecaseSystemId.get(usecase.systemId) ?? [];
      rewrites.push(rewrite);
      rewritesByUsecaseSystemId.set(usecase.systemId, rewrites);
    }
  }

  const seenUsecaseSystemIds = new Set<number>();
  for (const mdfSubgraphSystemId of [
    ...inventory.topology.deletedMdfSubgraphSystemIds,
  ].sort((left, right) => left - right)) {
    for (const usecase of inventory.topology.committedUsecasesByMdfSubgraph.get(
      mdfSubgraphSystemId,
    ) ?? []) {
      if (seenUsecaseSystemIds.has(usecase.systemId)) continue;
      seenUsecaseSystemIds.add(usecase.systemId);
      const collapseRewrites = mdfCollapseAnalyzer.analyze(
        usecase,
        inventory.topology,
      );
      if (collapseRewrites.length === 0) continue;
      const rewrites = rewritesByUsecaseSystemId.get(usecase.systemId) ?? [];
      rewrites.push(...collapseRewrites);
      rewritesByUsecaseSystemId.set(usecase.systemId, rewrites);
    }
  }

  return rewritesByUsecaseSystemId;
}

/**
 * Recovers the committed UC for a rewrite candidate. Most UCs are found directly via an
 * existing deletion mark; a UC whose only impact is an MDF collapse (no ordinary deletion
 * mark at all) is found instead by searching the rewrite's own MDF member index.
 */
function getCommittedUsecase(
  usecaseSystemId: number,
  rewrites: readonly MdfTopologyRewrite[],
  inventory: ImpactInventory,
): UseCase | undefined {
  const deletionMark =
    inventory.ucMarkedForDeletionBySystemId.get(usecaseSystemId);
  if (deletionMark !== undefined) return deletionMark.usecase;
  for (const rewrite of rewrites) {
    for (const mdfSubgraphSystemId of rewrite.mdfSubgraphSystemIds) {
      const usecase = inventory.topology.committedUsecasesByMdfSubgraph
        .get(mdfSubgraphSystemId)
        ?.find(candidate => candidate.systemId === usecaseSystemId);
      if (usecase !== undefined) return usecase;
    }
  }
  return undefined;
}

/**
 * True when this UC has any deletion impact that its candidate rewrites do not already
 * explain: an uncovered deleted member subgraph, a deleted control link between two of its
 * subgraphs, a pending island-transition candidate, or an uncovered deleted data-link. Any
 * of these means the UC still needs ordinary deletion/preservation handling, so it must not
 * be normalized in place.
 */
function hasUncoveredOrdinaryImpact(
  usecase: UseCase,
  rewrites: readonly MdfTopologyRewrite[],
  inventory: ImpactInventory,
): boolean {
  const coveredMdfSubgraphSystemIds = new Set(
    rewrites.flatMap(rewrite => rewrite.mdfSubgraphSystemIds),
  );
  if (
    usecase.subgraphSystemIds.some(
      systemId =>
        inventory.topology.deletedSubgraphSystemIds.has(systemId) &&
        !coveredMdfSubgraphSystemIds.has(systemId),
    )
  ) {
    return true;
  }
  if (
    inventory.topology.deletedControlLinks.some(
      link =>
        usecase.subgraphSystemIds.includes(link.sourceSubgraphSystemId) &&
        usecase.subgraphSystemIds.includes(link.destSubgraphSystemId),
    )
  ) {
    return true;
  }
  if (inventory.islandUseCaseCandidatesBySystemId.has(usecase.systemId)) {
    return true;
  }
  const coveredPairKeys = new Set(
    rewrites.flatMap(rewrite =>
      rewrite.committedPairs.map(pair =>
        directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
      ),
    ),
  );
  return inventory.topology.deletedDataLinks.some(link => {
    const pairKey = directedPairKey(
      link.sourceSubgraphSystemId,
      link.destSubgraphSystemId,
    );
    return (
      usecase.subgraphSystemIds.includes(link.sourceSubgraphSystemId) &&
      usecase.subgraphSystemIds.includes(link.destSubgraphSystemId) &&
      !coveredPairKeys.has(pairKey)
    );
  });
}

/**
 * Determines the single EC/non-EC semantic a rewrite's normalized pairs must share, by
 * reading the live routable adjacency (not the deleted committed links). Returns `null` when
 * a normalized pair's adjacency is ambiguous (not exactly one semantic) or when different
 * normalized pairs in the same rewrite disagree — either case makes the rewrite's EC status
 * undecidable, and `buildMdfNormalizationDecisions` treats that as a rewrite conflict.
 */
function rewriteIsEc(
  rewrite: MdfTopologyRewrite,
  adjacency: TopologyImpactInventory['routableAdjacency'],
): boolean | null {
  let semantic: boolean | undefined;
  for (const pair of rewrite.normalizedPairs) {
    const semantics = new Set(
      (adjacency.get(pair.sourceSubgraphSystemId) ?? [])
        .filter(edge => edge.destSubgraphSystemId === pair.destSubgraphSystemId)
        .map(edge => edge.isEc),
    );
    if (semantics.size !== 1) return null;
    const [isEc] = semantics;
    if (semantic !== undefined && semantic !== isEc) return null;
    semantic = isEc;
  }
  return semantic ?? null;
}

// A UC's rewrite set must pass every one of ~8 independent validation gates (conflicting
// rewrites, cross-covering add/remove, invalid pairs, endpoint survival, unchanged UC type,
// at most one EC crossing) before it is safe to normalize instead of delete; each gate is a
// short, self-contained check, but the sheer count is what drives the complexity score up.
// eslint-disable-next-line sonarjs/cognitive-complexity
function buildMdfNormalizationDecisions(
  allRewrites: ReadonlyMap<number, readonly MdfTopologyRewrite[]>,
  inventory: ImpactInventory,
): readonly MdfNormalizationDecision[] {
  const decisions: MdfNormalizationDecision[] = [];

  for (const [usecaseSystemId, rawRewrites] of [...allRewrites.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    // Gate 1: the UC must still be a known committed UC (deletion mark or MDF member).
    const usecase = getCommittedUsecase(
      usecaseSystemId,
      rawRewrites,
      inventory,
    );
    if (usecase === undefined) continue;
    // Gate 2: every deletion touching this UC must be explained by an MDF rewrite; any
    // leftover ordinary impact means the UC still needs deletion/reconstruction handling.
    if (hasUncoveredOrdinaryImpact(usecase, rawRewrites, inventory)) continue;

    // Gate 3: collapse duplicate rewrites for the same direct pair, but reject the UC if two
    // rewrites disagree on how that pair should be normalized.
    const rewritesByDirectPairKey = new Map<string, MdfTopologyRewrite>();
    let hasRewriteConflict = false;
    for (const rewrite of rawRewrites) {
      const key = directedPairKey(
        rewrite.directPair.sourceSubgraphSystemId,
        rewrite.directPair.destSubgraphSystemId,
      );
      const existing = rewritesByDirectPairKey.get(key);
      if (
        existing !== undefined &&
        (existing.kind !== rewrite.kind ||
          existing.mdfSubgraphSystemIds.join(',') !==
            rewrite.mdfSubgraphSystemIds.join(','))
      ) {
        hasRewriteConflict = true;
        break;
      }
      if (existing === undefined) rewritesByDirectPairKey.set(key, rewrite);
    }
    if (hasRewriteConflict) continue;
    const rewrites = [...rewritesByDirectPairKey.values()].sort((left, right) =>
      comparePairs(left.directPair, right.directPair),
    );

    // Gate 4: a single MDF member must not be simultaneously added (expansion) and removed
    // (collapse) by this UC's rewrite set; that would be an unresolvable structural conflict.
    const addedMdfSubgraphSystemIds = new Set(
      rewrites
        .filter(
          rewrite => rewrite.kind === MDF_TOPOLOGY_REWRITE_KIND.DirectToMdf,
        )
        .flatMap(rewrite => rewrite.mdfSubgraphSystemIds),
    );
    const removedMdfSubgraphSystemIds = new Set(
      rewrites
        .filter(
          rewrite => rewrite.kind === MDF_TOPOLOGY_REWRITE_KIND.MdfToDirect,
        )
        .flatMap(rewrite => rewrite.mdfSubgraphSystemIds),
    );
    if (
      [...addedMdfSubgraphSystemIds].some(systemId =>
        removedMdfSubgraphSystemIds.has(systemId),
      )
    ) {
      continue;
    }

    // Gate 5: a normalized pair must not be a self-loop or duplicate a pair the rewrite set
    // is simultaneously removing; either case means the rewrite set describes an invalid UC.
    const removedPairKeys = new Set(
      rewrites.flatMap(rewrite =>
        rewrite.committedPairs.map(pair =>
          directedPairKey(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ),
        ),
      ),
    );
    const addedPairByKey = new Map<string, SubgraphPair>();
    let hasInvalidPair = false;
    for (const rewrite of rewrites) {
      for (const normalizedPair of rewrite.normalizedPairs) {
        if (
          normalizedPair.sourceSubgraphSystemId ===
            normalizedPair.destSubgraphSystemId ||
          removedPairKeys.has(
            directedPairKey(
              normalizedPair.sourceSubgraphSystemId,
              normalizedPair.destSubgraphSystemId,
            ),
          )
        ) {
          hasInvalidPair = true;
          break;
        }
        addedPairByKey.set(
          directedPairKey(
            normalizedPair.sourceSubgraphSystemId,
            normalizedPair.destSubgraphSystemId,
          ),
          normalizedPair,
        );
      }
      if (hasInvalidPair) break;
    }
    if (hasInvalidPair) continue;

    // Gate 6: every endpoint of an added pair must end up as a member of the resulting UC;
    // otherwise the normalization would reference a subgraph the UC no longer contains.
    const resultingSubgraphSystemIds = new Set(usecase.subgraphSystemIds);
    for (const systemId of addedMdfSubgraphSystemIds)
      resultingSubgraphSystemIds.add(systemId);
    for (const systemId of removedMdfSubgraphSystemIds)
      resultingSubgraphSystemIds.delete(systemId);
    if (
      [...addedPairByKey.values()].some(
        pair =>
          !resultingSubgraphSystemIds.has(pair.sourceSubgraphSystemId) ||
          !resultingSubgraphSystemIds.has(pair.destSubgraphSystemId),
      )
    ) {
      continue;
    }

    const resultingPairByKey = new Map<string, SubgraphPair>();
    for (const committedPair of usecase.subgraphPairs) {
      const key = directedPairKey(
        committedPair.sourceSubgraphSystemId,
        committedPair.destSubgraphSystemId,
      );
      if (!removedPairKeys.has(key)) resultingPairByKey.set(key, committedPair);
    }
    for (const [key, addedPair] of addedPairByKey)
      resultingPairByKey.set(key, addedPair);
    const resultingPairs = [...resultingPairByKey.values()].sort(comparePairs);
    // Gate 7: normalization must be type-neutral. A pair-support change that would flip the
    // UC between LINKED/EC/ISLAND is a different topology decision, not an MDF normalization.
    const resultingType = computeUsecaseTypeFromPairSupport(
      [...resultingSubgraphSystemIds],
      resultingPairs,
      pair =>
        inventory.topology.routableAdjacency
          .get(pair.sourceSubgraphSystemId)
          ?.filter(
            edge => edge.destSubgraphSystemId === pair.destSubgraphSystemId,
          ) ?? [],
    );
    if (resultingType !== usecase.type) continue;

    // Gate 8: an EC crossing can legally move but not multiply. Count EC pairs the rewrites
    // introduce, plus any already-EC resulting pair the rewrite set left untouched, and
    // reject if the UC would end up with more than one logical EC crossing.
    const normalizedPairKeys = new Set(
      rewrites.flatMap(rewrite =>
        rewrite.normalizedPairs.map(pair =>
          directedPairKey(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ),
        ),
      ),
    );
    let logicalEcCrossings = 0;
    for (const rewrite of rewrites) {
      const isEc = rewriteIsEc(rewrite, inventory.topology.routableAdjacency);
      if (isEc === null) {
        hasRewriteConflict = true;
        break;
      }
      if (isEc) logicalEcCrossings += 1;
    }
    if (hasRewriteConflict) continue;
    for (const resultingPair of resultingPairs) {
      const key = directedPairKey(
        resultingPair.sourceSubgraphSystemId,
        resultingPair.destSubgraphSystemId,
      );
      if (normalizedPairKeys.has(key)) continue;
      if (
        (
          inventory.topology.routableAdjacency.get(
            resultingPair.sourceSubgraphSystemId,
          ) ?? []
        ).some(
          edge =>
            edge.destSubgraphSystemId === resultingPair.destSubgraphSystemId &&
            edge.isEc,
        )
      ) {
        logicalEcCrossings += 1;
      }
    }
    if (logicalEcCrossings > 1) continue;

    const addedSubgraphSystemIds = [...addedMdfSubgraphSystemIds].sort(
      (left, right) => left - right,
    );
    const removedSubgraphSystemIds = [...removedMdfSubgraphSystemIds].sort(
      (left, right) => left - right,
    );
    const removedPairs = [...removedPairKeys]
      .map(key =>
        rewrites
          .flatMap(rewrite => rewrite.committedPairs)
          .find(
            pair =>
              directedPairKey(
                pair.sourceSubgraphSystemId,
                pair.destSubgraphSystemId,
              ) === key,
          ),
      )
      .filter((pair): pair is SubgraphPair => pair !== undefined)
      .sort(comparePairs);

    // All gates passed: this UC is normalized instead of deleted, so its deletion mark (if
    // any) is retracted before the decision is recorded.
    inventory.ucMarkedForDeletionBySystemId.delete(usecaseSystemId);
    decisions.push({
      kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
      usecase,
      rewrites,
      structuralChange: {
        addedSubgraphSystemIds,
        removedSubgraphSystemIds,
        addedPairs: [...addedPairByKey.values()].sort(comparePairs),
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
    });
  }

  return decisions;
}

// --- Stage 3: resolve what remains after MDF normalization. Multi-path UCs whose stored
// pairs still hold are preserved as-is; LINKED UCs that lost their last data-link but kept a
// control-link become island-transition candidates; everything else stays marked for
// deletion, to be handled later by DeletionReconstructionService. ---

function processMarkedUsecase(
  mark: DeletionMarkDraft,
  inventory: ImpactInventory,
  preservedUsecases: PreservedUsecaseDraft[],
): void {
  if (isMultiPathTopology(mark.usecase)) {
    // Multi-path UCs may lose isolated members, but auto-routing must not invent a new
    // topology. Preserve only when every stored pair remains supported.
    const hasBrokenPair = mark.usecase.subgraphPairs.some(
      pair =>
        !endpointsSurvive(
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
          inventory.topology.deletedSubgraphSystemIds,
        ) ||
        !hasPairSupport(
          pair,
          inventory.topology.survivingDataLinkPairKeys,
          inventory.topology.survivingControlLinkPairKeys,
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
          systemId => inventory.topology.deletedSubgraphSystemIds.has(systemId),
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

/**
 * Ties Stage 2 and Stage 3 together in the order decisions must be resolved: MDF
 * normalization runs first and retracts any deletion mark it explains, then the remaining
 * marks are resolved as preserve-or-delete, then island-transition candidates are built.
 * A UC that is both preserved (multi-path, pairs intact) and an island-transition candidate
 * is reported only as the island transition, since that is the more specific decision.
 */
function buildAnalysis(
  inventory: ImpactInventory,
  mdfExpansionAnalyzer: MdfExpansionAnalyzer,
  mdfCollapseAnalyzer: MdfCollapseAnalyzer,
): TopologyChangeAnalysis {
  const allRewrites = collectAllRewrites(
    inventory,
    mdfExpansionAnalyzer,
    mdfCollapseAnalyzer,
  );
  const mdfDecisions = buildMdfNormalizationDecisions(allRewrites, inventory);

  // Build the complete draft first. Publishing happens once so later phases never observe
  // partially processed deletion state.
  const preservedUsecases: PreservedUsecaseDraft[] = [];
  const ucDeletionMarks = [
    ...inventory.ucMarkedForDeletionBySystemId.values(),
  ].sort((left, right) => left.usecase.systemId - right.usecase.systemId);
  for (const mark of ucDeletionMarks) {
    processMarkedUsecase(mark, inventory, preservedUsecases);
  }

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
  const controlPairRemovalDecisions = [
    ...inventory.controlPairRemovalsByUsecaseSystemId.values(),
  ]
    .filter(
      item =>
        !inventory.ucMarkedForDeletionBySystemId.has(item.usecase.systemId),
    )
    .map(item => ({
      kind: USECASE_TOPOLOGY_DECISION_KIND.ControlPairRemoval,
      usecase: item.usecase,
      removedPairs: [...item.pairs.values()].sort(comparePairs),
    }));
  const islandUsecaseSystemIds = new Set(
    transitionToIslandDecisions.map(decision => decision.usecase.systemId),
  );
  return buildTopologyChangeAnalysis(
    mdfDecisions,
    controlPairRemovalDecisions,
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

/**
 * A single root and leaf identify the committed-UC shape that can be safely replaced by
 * bounded DFS. Every other shape (branching, isolated members, cycles) is multi-path and
 * is never auto-reconstructed; `processMarkedUsecase` only needs this yes/no answer.
 */
function isMultiPathTopology(usecase: UseCase): boolean {
  const incoming = new Set<number>();
  const outgoing = new Set<number>();
  for (const pair of usecase.subgraphPairs) {
    incoming.add(pair.destSubgraphSystemId);
    outgoing.add(pair.sourceSubgraphSystemId);
  }
  const startCount = usecase.subgraphSystemIds.filter(
    id => !incoming.has(id),
  ).length;
  const endCount = usecase.subgraphSystemIds.filter(
    id => !outgoing.has(id),
  ).length;
  return startCount !== 1 || endCount !== 1;
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

/** Public result: the raw Phase 2 inventory plus the resolved topology decisions. */
export interface TopologyDecisionAnalysisResult {
  readonly inventory: ImpactInventory;
  readonly analysis: TopologyChangeAnalysis;
}

/**
 * Phase 2 entry point (see the file header for the full reading order). Builds the Stage 1
 * impact inventory from the session's graph snapshot, then resolves it into the final set of
 * Stage 2/3 topology decisions.
 */
export function analyzeTopologyChanges(
  snapshot: RoutingGraphSnapshot,
  mdfExpansionAnalyzer: MdfExpansionAnalyzer,
  mdfCollapseAnalyzer: MdfCollapseAnalyzer,
): TopologyDecisionAnalysisResult {
  const inventory = buildImpactInventory(snapshot);
  return {
    inventory,
    analysis: buildAnalysis(
      inventory,
      mdfExpansionAnalyzer,
      mdfCollapseAnalyzer,
    ),
  };
}
