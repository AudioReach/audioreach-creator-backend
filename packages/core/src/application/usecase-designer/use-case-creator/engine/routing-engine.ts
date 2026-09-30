/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingInput} from '../contracts/routing-input.js';
import type {SameGkvCollisionGroup} from '../contracts/same-gkv-collision.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import type {PreValidationPhase} from '../phases/pre-validation/pre-validation.phase.js';
import type {TopologyChangeAnalysisPhase} from '../phases/topology-change-analysis/topology-change-analysis.phase.js';
import type {IslandTransitionPhase} from '../phases/island-transition/island-transition.phase.js';
import type {KvResolutionPhase} from '../phases/kv-resolution.phase.js';
import type {SeedDetectionPhase} from '../phases/seed-detection.phase.js';
import type {ConeComputationPhase} from '../phases/cone-computation.phase.js';
import type {DfsRoutingPhase} from '../phases/dfs-routing/dfs-routing.phase.js';
import type {CombinationExpansionPhase} from '../phases/combination-expansion/combination-expansion.phase.js';
import type {ClassificationPhase} from '../phases/classification/classification.phase.js';
import type {OrphanValidationPhase} from '../phases/orphan-validation.phase.js';
import type {RoutingChangeStagingPhase} from '../phases/routing-change-staging/routing-change-staging.phase.js';
import type {ResponseBuilderPhase} from '../phases/response-builder.phase.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';

/**
 * Runs the routing phases in dependency order and owns no business state between calls.
 *
 * A normal run executes analysis, candidate generation, validation, staging, and response
 * projection. Collision replay runs only the prerequisite phases and classification so it
 * can return a collision without staging database changes.
 */
export class RoutingEngine {
  constructor(
    private readonly preValidation: PreValidationPhase,
    private readonly topologyChangeAnalysis: TopologyChangeAnalysisPhase,
    private readonly islandTransition: IslandTransitionPhase,
    private readonly kvResolution: KvResolutionPhase,
    private readonly seedDetection: SeedDetectionPhase,
    private readonly coneComputation: ConeComputationPhase,
    private readonly dfsRouting: DfsRoutingPhase,
    private readonly combinationExpansion: CombinationExpansionPhase,
    private readonly classification: ClassificationPhase,
    private readonly orphanValidation: OrphanValidationPhase,
    private readonly routingChangeStaging: RoutingChangeStagingPhase,
    private readonly responseBuilder: ResponseBuilderPhase,
  ) {}

  async run(
    input: RoutingInput,
    uow: UnitOfWork,
    idGeneration: IdGenerationPort,
  ): Promise<Result<RoutingOutcome>> {
    const context = new RoutingContext(input);
    const phases: readonly (() => Promise<Result<void>>)[] = [
      () => this.preValidation.run(context),
      () =>
        this.topologyChangeAnalysis.run(context, uow.getSubgraphRepository()),
      () => this.islandTransition.run(context),
      () => this.kvResolution.run(context, uow.getSubgraphRepository()),
      () => this.seedDetection.run(context),
      () => this.coneComputation.run(context),
      () => this.dfsRouting.run(context),
      () => this.combinationExpansion.run(context),
      () => this.classification.run(context),
      () => this.orphanValidation.run(context, uow.getSubsystemRepository()),
      () => this.routingChangeStaging.run(context, uow, idGeneration),
      () => this.responseBuilder.run(context, uow.getWriteContext().groupId),
    ];
    for (const runPhase of phases) {
      const result = await runPhase();
      if (result.kind === RESULT_KIND.Fail) return result;
    }
    return Result.ok(
      context.routingOutcome ??
        createEmptyRoutingOutcome(
          uow.getWriteContext().groupId,
          context.emittedUcChanges,
          context.warnings,
        ),
    );
  }

  async resolveCollision(
    input: RoutingInput,
    uow: UnitOfWork,
    collisionId: string,
  ): Promise<Result<SameGkvCollisionGroup>> {
    const context = new RoutingContext(input);
    const prerequisitePhases: readonly (() => Promise<Result<void>>)[] = [
      () => this.preValidation.run(context),
      () =>
        this.topologyChangeAnalysis.run(context, uow.getSubgraphRepository()),
      () => this.islandTransition.run(context),
      () => this.kvResolution.run(context, uow.getSubgraphRepository()),
      () => this.seedDetection.run(context),
      () => this.coneComputation.run(context),
      () => this.dfsRouting.run(context),
      () => this.combinationExpansion.run(context),
    ];
    for (const runPhase of prerequisitePhases) {
      const result = await runPhase();
      if (result.kind === RESULT_KIND.Fail)
        return Result.fail(...result.issues);
    }

    const classificationResult = await this.classification.run(context);
    const collision = context.sameGkvCollisionGroups.find(
      current => current.collisionId === collisionId,
    );
    if (collision !== undefined) return Result.ok(collision);
    if (classificationResult.kind === RESULT_KIND.Fail)
      return Result.fail(...classificationResult.issues);
    return Result.fail(RoutingIssueFactory.sameGkvChoiceStale(collisionId));
  }
}
