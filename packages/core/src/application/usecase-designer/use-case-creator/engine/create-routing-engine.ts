/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingEngine} from './routing-engine.js';
import {CombinationExpansionService} from '../phases/combination-expansion.service.js';
import {ConeComputationService} from '../phases/cone-computation.service.js';
import {ClassificationService} from '../phases/classification.service.js';
import {DeletionScopeService} from '../phases/deletion-scope.service.js';
import {IslandTransitionService} from '../phases/island-transition.service.js';
import {DfsRoutingService} from '../phases/dfs-routing.service.js';
import {KvResolutionService} from '../phases/kv-resolution.service.js';
import {OrphanValidationService} from '../phases/orphan-validation.service.js';
import {PreValidationService} from '../phases/pre-validation.service.js';
import {ResponseBuilder} from '../phases/response-builder.js';
import {RoutingChangeStager} from '../phases/routing-change-stager.js';
import {SeedDetectionService} from '../phases/seed-detection.service.js';

export function createRoutingEngine(): RoutingEngine {
  return new RoutingEngine(
    new PreValidationService(),
    new DeletionScopeService(),
    new IslandTransitionService(),
    new KvResolutionService(),
    new SeedDetectionService(),
    new ConeComputationService(),
    new DfsRoutingService(),
    new CombinationExpansionService(),
    new ClassificationService(),
    new OrphanValidationService(),
    new RoutingChangeStager(),
    new ResponseBuilder(),
  );
}
