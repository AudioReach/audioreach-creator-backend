/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type ClassifiedUsecase,
  type RoutingCombination,
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
  exactTopologyEquals,
} from '../../shared/usecase-topology.js';
import {projectCommittedUcsWithMdfSubstitutions} from '../../shared/projected-usecase-topology.js';

export class ClassificationPhase {
  constructor(
    private readonly sameGkvCollisionService: SameGkvCollisionService = new SameGkvCollisionService(),
  ) {}

  run(context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    const candidates = [
      ...context.routingCandidates.combinations,
      ...context.routingCandidates.ecBridgeCandidates,
    ];
    const analysis = context.topologyChangeAnalysis;
    if (analysis === null)
      throw new Error('Topology change analysis must run before this phase');

    const projectedUsecases = projectCommittedUcsWithMdfSubstitutions(context);
    const deleteOrReconstructDecisions = analysis.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
    );

    if (context.input.mode !== ROUTING_MODE.Auto) {
      context.classifiedUcs.push(
        ...candidates.map(candidate =>
          this.classifySingleCandidate(
            candidate,
            projectedUsecases,
            deleteOrReconstructDecisions,
          ),
        ),
      );
      return Promise.resolve(Result.ok());
    }

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
    if (issues.length > 0) return Promise.resolve(Result.fail(...issues));
    context.classifiedUcs.push(...classifications);
    return Promise.resolve(Result.ok());
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
      exactTopologyEquals(candidate, existingUsecase),
    );
    const nonExactCandidates = bucket.candidates.filter(
      candidate => !exactTopologyEquals(candidate, existingUsecase),
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

  private classifySingleCandidate(
    candidate: RoutingCombination,
    projectedUsecases: readonly SameGkvBucket['existingUsecase'][],
    deleteOrReconstructDecisions: readonly DeleteOrReconstructDecision[],
  ): ClassifiedUsecase {
    const usecases = projectedUsecases.filter(usecase => usecase !== null);
    const exactUsecase = usecases.find(existingUsecase =>
      exactTopologyEquals(candidate, existingUsecase),
    );
    if (exactUsecase) {
      return {
        kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
        candidate,
        existingUsecase: exactUsecase,
      };
    }
    const interiorExtension = usecases.find(
      existingUsecase =>
        addedInteriorSubgraphIds(candidate, existingUsecase).length > 0,
    );
    if (interiorExtension) {
      return {
        kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
        candidate,
        existingUsecase: interiorExtension,
        cancelPendingDelete: deleteOrReconstructDecisions.some(
          decision => decision.usecase.systemId === interiorExtension.systemId,
        ),
      };
    }
    return {kind: ROUTING_CLASSIFICATION_KIND.Create, candidate};
  }
}
