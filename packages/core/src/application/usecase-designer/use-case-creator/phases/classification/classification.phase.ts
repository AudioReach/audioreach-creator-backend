/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {ActiveManualUsecaseEdit} from '../../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type ClassifiedUsecase,
  type ManualUsecaseCandidate,
  type RoutedUsecaseCandidate,
  SEED_REASON,
  USECASE_CANDIDATE_KIND,
  USECASE_TOPOLOGY_DECISION_KIND,
  type DeleteOrReconstructDecision,
} from '../../contracts/routing-state.js';
import {
  SameGkvCollisionService,
  type SameGkvBucket,
} from './same-gkv-collision.service.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {
  addedInteriorSubgraphIds,
  canonicalNumericSetKey,
  candidateDataLinkPairs,
  candidatePairs,
  candidateSubgraphSystemIds,
  directedPairKeyOf,
  exactTopologyEquals,
  gkvValueIdKey,
} from '../../shared/usecase-topology.js';
import {hasDirectedDataLinkSupport} from '../../shared/usecase-type-classifier.js';
import {
  buildProjectedUsecaseTopology,
  projectCommittedUcsWithMdfSubstitutions,
} from '../../shared/projected-usecase-topology.js';
import {effectiveUsecasesWithManualEdits} from '../../shared/effective-usecase-catalog.js';

interface ManualGkvBucket {
  readonly gkvValueSystemIds: readonly number[];
  readonly candidates: readonly ManualUsecaseCandidate[];
}

type MaterializedManualUsecaseEdit = ActiveManualUsecaseEdit & {
  readonly usecase: UseCase;
};

function suppressesLegacyBridge(
  context: RoutingContext,
  candidate: RoutedUsecaseCandidate,
  projectedSurvivingUsecases: readonly UseCase[],
): boolean {
  if (candidate.kind !== USECASE_CANDIDATE_KIND.EcBridge) return false;
  if (candidate.path.subgraphSystemIds.length < 2) {
    throw new Error('An EC Bridge candidate requires two logical endpoints');
  }
  const leftSubgraphSystemId = candidate.path.subgraphSystemIds[0];
  const rightSubgraphSystemId = candidate.path.subgraphSystemIds.at(-1)!;
  const endpointKvChanged = [leftSubgraphSystemId, rightSubgraphSystemId].some(
    subgraphSystemId =>
      context.seeds?.reasons.get(subgraphSystemId) === SEED_REASON.KvChanged,
  );
  if (endpointKvChanged) return false;
  const bridgeMemberIds = new Set(candidate.path.subgraphSystemIds);
  const bridgePairKeys = new Set(
    candidateDataLinkPairs(candidate).map(pair => directedPairKeyOf(pair)),
  );
  return projectedSurvivingUsecases.some(usecase => {
    if (usecase.type !== USECASE_TYPE.Ec) return false;
    const projectedMemberIds = new Set(usecase.subgraphSystemIds);
    const projectedPairKeys = new Set(
      usecase.subgraphPairs
        .filter(pair =>
          hasDirectedDataLinkSupport(
            pair,
            context.input.graphSnapshot.routableDataLinks,
          ),
        )
        .map(pair => directedPairKeyOf(pair)),
    );
    const coversCompleteBridge =
      [...bridgeMemberIds].every(id => projectedMemberIds.has(id)) &&
      [...bridgePairKeys].every(key => projectedPairKeys.has(key));
    return (
      coversCompleteBridge &&
      (projectedMemberIds.size > bridgeMemberIds.size ||
        projectedPairKeys.size > bridgePairKeys.size)
    );
  });
}

function isExactClassificationMatch(
  candidate: RoutedUsecaseCandidate,
  existingUsecase: UseCase,
): boolean {
  return (
    exactTopologyEquals(candidate, existingUsecase) &&
    (candidate.kind !== USECASE_CANDIDATE_KIND.EcBridge ||
      existingUsecase.type === USECASE_TYPE.Ec)
  );
}

function classifyManualMode(context: RoutingContext): Result<void> {
  if (
    context.usecaseCandidates.automaticCandidates.length > 0 ||
    context.usecaseCandidates.ecBridgeCandidates.length > 0
  ) {
    throw new Error('Manual routing received a non-manual UseCase candidate');
  }
  const manualResult = classifyManualCandidates(
    context,
    context.usecaseCandidates.manualCandidates,
  );
  if (manualResult.issues.length > 0)
    return Result.fail(...manualResult.issues);
  context.classifiedUcs.push(...manualResult.classifications);
  return Result.ok();
}

export class ClassificationPhase {
  constructor(
    private readonly sameGkvCollisionService: SameGkvCollisionService = new SameGkvCollisionService(),
  ) {}

  run(context: RoutingContext): Result<void> {
    const analysis = context.topologyChangeAnalysis;
    if (analysis === null)
      throw new Error('Topology change analysis must run before this phase');

    const deleteOrReconstructDecisions = analysis.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
    );

    if (context.input.mode === ROUTING_MODE.Manual)
      return classifyManualMode(context);

    if (context.usecaseCandidates.manualCandidates.length > 0)
      throw new Error('Automatic routing received a manual UseCase candidate');
    const projectedSurvivingUsecases =
      buildProjectedUsecaseTopology(context).usecases;
    const candidates: RoutedUsecaseCandidate[] = [
      ...context.usecaseCandidates.automaticCandidates,
      ...context.usecaseCandidates.ecBridgeCandidates.filter(
        candidate =>
          !suppressesLegacyBridge(
            context,
            candidate,
            projectedSurvivingUsecases,
          ),
      ),
    ];
    const projectedUsecases = projectCommittedUcsWithMdfSubstitutions(context);
    const buckets = this.sameGkvCollisionService.buildBuckets(
      candidates,
      projectedUsecases,
      context.input.activeManualUsecaseEdits,
    );
    const classifications: ClassifiedUsecase[] = [];
    const groups = [] as ReturnType<SameGkvCollisionService['createGroup']>[];
    const issues = [] as ReturnType<
      typeof RoutingIssueFactory.sameGkvChoiceRequired
    >[];

    for (const bucket of buckets) {
      if (bucket.manualOverrides.length > 1) {
        issues.push(
          RoutingIssueFactory.multipleManualGkvOverrides(
            bucket.manualOverrides,
          ),
        );
        continue;
      }
      if (bucket.manualOverrides.length === 1) continue;
      if (bucket.candidates.length === 0) continue;

      const bucketResult = this.classifyBucket(
        bucket,
        deleteOrReconstructDecisions,
      );
      // Property presence narrows the result from the collision branch to the
      // branch containing a classified UseCase.
      if ('classification' in bucketResult) {
        classifications.push(bucketResult.classification);
        continue;
      }
      const group = this.sameGkvCollisionService.createGroup(bucket);
      groups.push(group);
      issues.push(
        RoutingIssueFactory.sameGkvChoiceRequired(
          group,
          context.input.selection,
        ),
      );
    }

    context.sameGkvCollisionGroups.push(...groups);
    if (issues.length > 0) return Result.fail(...issues);
    context.classifiedUcs.push(...classifications);
    return Result.ok();
  }

  private classifyBucket(
    bucket: SameGkvBucket,
    deleteOrReconstructDecisions: readonly DeleteOrReconstructDecision[],
  ): {readonly classification: ClassifiedUsecase} | {readonly collision: true} {
    const existingUsecase = bucket.existingUsecase;
    if (existingUsecase === null) {
      return bucket.candidates.length === 1
        ? {
            classification: {
              kind: ROUTING_CLASSIFICATION_KIND.Create,
              candidate: bucket.candidates[0],
            },
          }
        : {collision: true};
    }

    const exactCandidate = bucket.candidates.find(candidate =>
      isExactClassificationMatch(candidate, existingUsecase),
    );
    const nonExactCandidates = bucket.candidates.filter(
      candidate => !isExactClassificationMatch(candidate, existingUsecase),
    );
    if (nonExactCandidates.length === 0) {
      if (exactCandidate === undefined) {
        throw new Error('A classified GKV bucket must contain a candidate');
      }
      return {
        classification: {
          kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
          candidate: exactCandidate,
          existingUsecase,
        },
      };
    }

    if (nonExactCandidates.length === 1) {
      const candidate = nonExactCandidates[0];
      if (addedInteriorSubgraphIds(candidate, existingUsecase).length > 0) {
        return {
          classification: {
            kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
            candidate,
            existingUsecase,
            cancelPendingDelete: deleteOrReconstructDecisions.some(
              decision =>
                decision.usecase.systemId === existingUsecase.systemId,
            ),
          },
        };
      }
    }
    return {collision: true};
  }
}

function classifyManualCandidates(
  context: RoutingContext,
  candidates: readonly ManualUsecaseCandidate[],
): {
  readonly classifications: readonly ClassifiedUsecase[];
  readonly issues: readonly ReturnType<
    typeof RoutingIssueFactory.manualGkvConflict
  >[];
} {
  const comparisonUsecases = manualComparisonUsecases(context);
  const classifications: ClassifiedUsecase[] = [];
  const issues: ReturnType<typeof RoutingIssueFactory.manualGkvConflict>[] = [];
  const manualOverridesByGkv = groupManualOverridesByGkv(
    context.input.activeManualUsecaseEdits,
  );
  const duplicateManualGkvKeys = new Set<string>();
  for (const [gkvKey, manualOverrides] of [
    ...manualOverridesByGkv.entries(),
  ].sort(([left], [right]) => left.localeCompare(right))) {
    if (manualOverrides.length <= 1) continue;
    duplicateManualGkvKeys.add(gkvKey);
    issues.push(
      RoutingIssueFactory.multipleManualGkvOverrides(manualOverrides),
    );
  }

  for (const bucket of manualGkvBuckets(candidates)) {
    const gkvKey = canonicalNumericSetKey(bucket.gkvValueSystemIds);
    if (duplicateManualGkvKeys.has(gkvKey)) continue;
    const manualOverrides = manualOverridesByGkv.get(gkvKey) ?? [];

    const existingUsecasesWithSameGkv =
      manualOverrides.length === 1
        ? [manualOverrides[0].usecase]
        : comparisonUsecases.filter(
            usecase =>
              canonicalNumericSetKey(usecase.keyVector.valueSystemIds) ===
              gkvKey,
          );
    const candidate = bucket.candidates[0];
    const exactMatchExistingUsecase = existingUsecasesWithSameGkv.find(
      usecase => exactTopologyEquals(candidate, usecase),
    );
    if (
      bucket.candidates.length > 1 ||
      existingUsecasesWithSameGkv.length > 1 ||
      (existingUsecasesWithSameGkv.length === 1 &&
        exactMatchExistingUsecase === undefined)
    ) {
      issues.push(
        RoutingIssueFactory.manualGkvConflict(
          bucket.gkvValueSystemIds,
          existingUsecasesWithSameGkv.map(usecase => usecase.systemId),
          candidate,
        ),
      );
      continue;
    }
    classifications.push(
      exactMatchExistingUsecase === undefined
        ? {kind: ROUTING_CLASSIFICATION_KIND.Create, candidate}
        : {
            kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
            candidate,
            existingUsecase: exactMatchExistingUsecase,
          },
    );
  }

  return {classifications, issues};
}

function groupManualOverridesByGkv(
  edits: readonly ActiveManualUsecaseEdit[],
): ReadonlyMap<string, readonly MaterializedManualUsecaseEdit[]> {
  const byGkv = new Map<string, MaterializedManualUsecaseEdit[]>();
  for (const edit of edits) {
    if (!hasMaterializedUsecase(edit)) continue;
    const gkvKey = canonicalNumericSetKey(
      edit.usecase.keyVector.valueSystemIds,
    );
    const group = byGkv.get(gkvKey) ?? [];
    group.push(edit);
    byGkv.set(gkvKey, group);
  }
  return byGkv;
}

function hasMaterializedUsecase(
  edit: ActiveManualUsecaseEdit,
): edit is MaterializedManualUsecaseEdit {
  return edit.usecase !== null;
}

function manualGkvBuckets(
  candidates: readonly ManualUsecaseCandidate[],
): readonly ManualGkvBucket[] {
  const buckets = new Map<
    string,
    {
      readonly gkvValueSystemIds: readonly number[];
      readonly candidatesByTopology: Map<string, ManualUsecaseCandidate>;
    }
  >();
  for (const candidate of candidates) {
    const gkvKey = gkvValueIdKey(candidate.gkv);
    let bucket = buckets.get(gkvKey);
    if (bucket === undefined) {
      bucket = {
        gkvValueSystemIds: [
          ...new Set(candidate.gkv.map(pair => pair.valueDefSystemId)),
        ].sort((left, right) => left - right),
        candidatesByTopology: new Map(),
      };
      buckets.set(gkvKey, bucket);
    }
    const pairKey = [
      ...new Set(
        candidatePairs(candidate).map(pair => directedPairKeyOf(pair)),
      ),
    ]
      .sort((left, right) => left.localeCompare(right))
      .join(',');
    const topologyKey = `${canonicalNumericSetKey(
      candidateSubgraphSystemIds(candidate),
    )}|${pairKey}`;
    bucket.candidatesByTopology.set(topologyKey, candidate);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => ({
      gkvValueSystemIds: bucket.gkvValueSystemIds,
      candidates: [...bucket.candidatesByTopology.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, candidate]) => candidate),
    }));
}

function manualComparisonUsecases(context: RoutingContext): readonly UseCase[] {
  return effectiveUsecasesWithManualEdits(
    context.input.graphSnapshot.committedUsecases,
    context.input.activeManualUsecaseEdits,
  );
}
