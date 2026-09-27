/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {AutoRoutingInput} from '../contracts/routing-input.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {COLLISION_OPERAND_KIND} from '../contracts/same-gkv-collision.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type ClassifiedUsecase,
  type RoutingCombination,
  USECASE_TOPOLOGY_DECISION_KIND,
  type DeleteOrReconstructDecision,
} from '../contracts/routing-state.js';
import {SameGkvCollisionService} from '../services/same-gkv-collision.service.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {
  addedInteriorSubgraphIds,
  exactTopologyEquals,
} from '../shared/usecase-topology.js';
import {projectCommittedUcsWithMdfSubstitutions} from '../shared/projected-usecase-topology.js';

/**
 * Classifies routed candidates as existing topology matches, extensions, or
 * new UseCases, after rejecting unresolved same-GKV alternatives.
 */
export class ClassificationService {
  constructor(
    private readonly sameGkvCollisionService: SameGkvCollisionService = new SameGkvCollisionService(),
  ) {}

  run(context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    const candidates = [
      ...context.routingCandidates.combinations,
      ...context.routingCandidates.ecBridgeCandidates,
    ];
    const analysis = context.topologyChangeAnalysis;
    if (analysis === null) {
      throw new Error('Topology change analysis must run before this phase');
    }
    const projectedUsecases = projectCommittedUcsWithMdfSubstitutions(context);
    const deleteOrReconstructDecisions = analysis.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
    );
    const manuallyResolvedCandidates = new Set<RoutingCombination>();
    if (context.input.mode === ROUTING_MODE.Auto) {
      // A collision must be resolved before deciding whether its candidates
      // create, update, or reuse a UseCase.
      const collisionIssues = this.findUnresolvedCollisionIssues(
        candidates,
        context,
        projectedUsecases,
        manuallyResolvedCandidates,
      );
      if (collisionIssues.length > 0) {
        return Promise.resolve(Result.fail(...collisionIssues));
      }
    }

    const classifications: ClassifiedUsecase[] = [];
    for (const candidate of candidates) {
      // An active manual edit already materializes this collision resolution.
      if (manuallyResolvedCandidates.has(candidate)) continue;
      const exactUsecase = projectedUsecases.find(existingUsecase =>
        exactTopologyEquals(candidate, existingUsecase),
      );
      if (exactUsecase) {
        // The stager skips exact matches, so this candidate produces no write.
        classifications.push({
          kind: ROUTING_CLASSIFICATION_KIND.ExactMatch,
          candidate,
          existingUsecase: exactUsecase,
        });
        continue;
      }

      const interiorExtension = projectedUsecases
        .map(existingUsecase => ({
          existingUsecase,
          addedSubgraphSystemIds: addedInteriorSubgraphIds(
            candidate,
            existingUsecase,
          ),
        }))
        .find(({addedSubgraphSystemIds}) => addedSubgraphSystemIds.length > 0);
      if (interiorExtension) {
        // Extend the matching UseCase instead of creating a duplicate topology.
        classifications.push({
          kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
          candidate,
          existingUsecase: interiorExtension.existingUsecase,
          cancelPendingDelete: Boolean(
            deleteOrReconstructDecisions.some(
              decision =>
                decision.usecase.systemId ===
                interiorExtension.existingUsecase.systemId,
            ),
          ),
        });
        continue;
      }

      // No committed topology can absorb this candidate.
      classifications.push({
        kind: ROUTING_CLASSIFICATION_KIND.Create,
        candidate,
      });
    }
    context.classifiedUcs.push(...classifications);
    return Promise.resolve(Result.ok());
  }

  private findUnresolvedCollisionIssues(
    candidates: readonly RoutingContext['routingCandidates']['combinations'][number][],
    context: RoutingContext,
    projectedUsecases: readonly UseCase[],
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    if (context.input.mode !== ROUTING_MODE.Auto) return [];
    const input: AutoRoutingInput = context.input;
    // Exact matches and interior extensions are handled by normal classification,
    // not presented as same-GKV alternatives.
    const candidateCollisionOperands = candidates.filter(
      candidate =>
        !projectedUsecases.some(
          existingUsecase =>
            exactTopologyEquals(candidate, existingUsecase) ||
            addedInteriorSubgraphIds(candidate, existingUsecase).length > 0,
        ),
    );
    return candidateCollisionOperands.flatMap((left, leftIndex) => [
      ...this.findCandidateCollisions(
        left,
        candidateCollisionOperands.slice(leftIndex + 1),
        context,
        input,
        manuallyResolvedCandidates,
      ),
      ...this.findExistingCollisions(
        left,
        context,
        input,
        projectedUsecases,
        manuallyResolvedCandidates,
      ),
    ]);
  }

  private findCandidateCollisions(
    left: RoutingContext['routingCandidates']['combinations'][number],
    rightCandidates: readonly RoutingContext['routingCandidates']['combinations'][number][],
    context: RoutingContext,
    input: AutoRoutingInput,
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    return rightCandidates.flatMap(right => {
      const collision = this.sameGkvCollisionService.detect(left, right);
      return this.collisionIssue(
        collision,
        context,
        input,
        manuallyResolvedCandidates,
      );
    });
  }

  private findExistingCollisions(
    candidate: RoutingContext['routingCandidates']['combinations'][number],
    context: RoutingContext,
    input: AutoRoutingInput,
    projectedUsecases: readonly UseCase[],
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    return projectedUsecases.flatMap(existing => {
      const collision = this.sameGkvCollisionService.detect(
        candidate,
        existing,
      );
      return this.collisionIssue(
        collision,
        context,
        input,
        manuallyResolvedCandidates,
      );
    });
  }

  private collisionIssue(
    collision: ReturnType<SameGkvCollisionService['detect']>,
    context: RoutingContext,
    input: AutoRoutingInput,
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    if (collision === null) return [];
    context.sameGkvCollisions.push(collision);
    if (
      this.sameGkvCollisionService.isResolutionRecognized(
        collision,
        input.activeManualUsecaseEdits,
      )
    ) {
      // A manual edit already materializes an allowed resolution; do not stage
      // the colliding automatic candidates a second time.
      for (const operand of collision.operands) {
        if (operand.kind === COLLISION_OPERAND_KIND.New) {
          manuallyResolvedCandidates.add(operand.candidate);
        }
      }
      return [];
    }
    return [
      RoutingIssueFactory.sameGkvChoiceRequired(collision, input.selection),
    ];
  }
}
