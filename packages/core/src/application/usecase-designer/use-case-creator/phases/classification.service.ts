/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import type {AutoRoutingInput} from '../contracts/routing-input.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {COLLISION_OPERAND_KIND} from '../contracts/same-gkv-collision.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type ClassifiedUsecase,
  type RoutingCombination,
} from '../contracts/routing-state.js';
import {ManualUsecaseDependencyValidator} from '../services/manual-usecase-dependency-validator.js';
import {SameGkvCollisionService} from '../services/same-gkv-collision.service.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {
  addedInteriorSubgraphIds,
  exactTopologyEquals,
} from '../shared/usecase-topology.js';

/**
 * Classifies routed candidates as existing topology matches, extensions, or
 * new UseCases, after rejecting unresolved same-GKV alternatives.
 */
export class ClassificationService {
  constructor(
    private readonly manualUsecaseDependencyValidator: ManualUsecaseDependencyValidator = new ManualUsecaseDependencyValidator(),
    private readonly sameGkvCollisionService: SameGkvCollisionService = new SameGkvCollisionService(),
  ) {}

  run(context: RoutingContext): Promise<ReturnType<typeof Result.ok<void>>> {
    if (context.input.mode === ROUTING_MODE.Auto) {
      // Automatic routing cannot safely proceed from a stale manual edit.
      const issues = this.manualUsecaseDependencyValidator.run(
        context.input.activeManualUsecaseEdits,
        context.input.graphSnapshot,
      );
      if (issues.length > 0) return Promise.resolve(Result.fail(...issues));
    }

    const candidates = [
      ...context.routingCandidates.combinations,
      ...context.routingCandidates.ecBridgeCandidates,
    ];
    const manuallyResolvedCandidates = new Set<RoutingCombination>();
    if (context.input.mode === ROUTING_MODE.Auto) {
      // A collision must be resolved before deciding whether its candidates
      // create, update, or reuse a UseCase.
      const collisionIssues = this.findUnresolvedCollisionIssues(
        candidates,
        context,
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
      const exactUsecase = context.input.graphSnapshot.committedUsecases.find(
        existingUsecase => exactTopologyEquals(candidate, existingUsecase),
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

      const interiorExtension = context.input.graphSnapshot.committedUsecases
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
            context.deletionAnalysis?.markedForDeletion.some(
              mark =>
                mark.usecase.systemId ===
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
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    if (context.input.mode !== ROUTING_MODE.Auto) return [];
    const input: AutoRoutingInput = context.input;
    // Exact matches and interior extensions are handled by normal classification,
    // not presented as same-GKV alternatives.
    const candidateCollisionOperands = candidates.filter(
      candidate =>
        !input.graphSnapshot.committedUsecases.some(
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
    manuallyResolvedCandidates: Set<RoutingCombination>,
  ): Issue[] {
    return input.graphSnapshot.committedUsecases.flatMap(existing => {
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
