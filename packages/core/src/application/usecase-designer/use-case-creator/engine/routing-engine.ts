/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND, Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingInput} from '../contracts/routing-input.js';
import {createEmptyRoutingOutcome} from '../contracts/routing-outcome.js';
import type {RoutingOutcome} from '../contracts/routing-outcome.js';
import type {RoutingPhase} from '../contracts/routing-phase.js';
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
  private readonly phases: readonly RoutingPhase[];

  constructor(
    preValidation: PreValidationService,
    deletionScope: DeletionScopeService,
    islandTransition: IslandTransitionService,
    kvResolution: KvResolutionService,
    seedDetection: SeedDetectionService,
    coneComputation: ConeComputationService,
    dfsRouting: DfsRoutingService,
    combinationExpansion: CombinationExpansionService,
    classification: ClassificationService,
    orphanValidation: OrphanValidationService,
    routingChangeStager: RoutingChangeStager,
    responseBuilder: ResponseBuilder,
  ) {
    this.phases = Object.freeze([
      preValidation,
      deletionScope,
      islandTransition,
      kvResolution,
      seedDetection,
      coneComputation,
      dfsRouting,
      combinationExpansion,
      classification,
      orphanValidation,
      routingChangeStager,
      responseBuilder,
    ]);
  }

  async run(
    input: RoutingInput,
    uow: UnitOfWork,
  ): Promise<Result<RoutingOutcome>> {
    const context = new RoutingContext(input);
    for (const phase of this.phases) {
      const result = await phase.run(context, uow);
      if (result.kind === RESULT_KIND.Fail) return result;
    }
    return Result.ok(
      context.response ??
        createEmptyRoutingOutcome(uow.getWriteContext().groupId, context.warnings),
    );
  }
}
