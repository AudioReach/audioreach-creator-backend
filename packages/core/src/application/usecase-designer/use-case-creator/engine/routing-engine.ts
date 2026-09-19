/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingInput} from '../contracts/routing-input.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import type {PreValidationService} from '../phases/pre-validation.service.js';
import type {DeletionScopeService} from '../phases/deletion-scope.service.js';
import type {IslandTransitionService} from '../phases/island-transition.service.js';
import type {KvResolutionService} from '../phases/kv-resolution.service.js';
import type {SeedDetectionService} from '../phases/seed-detection.service.js';
import type {ConeComputationService} from '../phases/cone-computation.service.js';
import type {DfsRoutingService} from '../phases/dfs-routing.service.js';
import type {CombinationExpansionService} from '../phases/combination-expansion.service.js';
import type {ClassificationService} from '../phases/classification.service.js';
import type {OrphanValidationService} from '../phases/orphan-validation.service.js';
import type {RoutingChangeStager} from '../phases/routing-change-stager.js';
import type {ResponseBuilder} from '../phases/response-builder.js';

export class RoutingEngine {
  constructor(
    private readonly preValidation: PreValidationService,
    private readonly deletionScope: DeletionScopeService,
    private readonly islandTransition: IslandTransitionService,
    private readonly kvResolution: KvResolutionService,
    private readonly seedDetection: SeedDetectionService,
    private readonly coneComputation: ConeComputationService,
    private readonly dfsRouting: DfsRoutingService,
    private readonly combinationExpansion: CombinationExpansionService,
    private readonly classification: ClassificationService,
    private readonly orphanValidation: OrphanValidationService,
    private readonly routingChangeStager: RoutingChangeStager,
    private readonly responseBuilder: ResponseBuilder,
  ) {}

  async run(
    input: RoutingInput,
    uow: UnitOfWork,
  ): Promise<Result<RoutingOutcome>> {
    const context = new RoutingContext(input);
    const phases: readonly (() => Promise<Result<void>>)[] = [
      () => this.preValidation.run(context),
      () => this.deletionScope.run(context, uow.getSubgraphRepository()),
      () => this.islandTransition.run(context),
      () => this.kvResolution.run(context, uow.getSubgraphRepository()),
      () => this.seedDetection.run(context),
      () => this.coneComputation.run(context),
      () => this.dfsRouting.run(context),
      () => this.combinationExpansion.run(context),
      () => this.classification.run(context),
      () => this.orphanValidation.run(context),
      () => this.routingChangeStager.run(context, uow),
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
}
