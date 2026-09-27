/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingEngine} from './routing-engine.js';
import {CombinationExpansionService} from '../phases/combination-expansion.service.js';
import {ConeComputationService} from '../phases/cone-computation.service.js';
import {ClassificationService} from '../phases/classification.service.js';
import {TopologyChangeAnalysisService} from '../phases/topology-change-analysis.service.js';
import {IslandTransitionService} from '../phases/island-transition.service.js';
import {DfsRoutingService} from '../phases/dfs-routing.service.js';
import {KvResolutionService} from '../phases/kv-resolution.service.js';
import {OrphanValidationService} from '../phases/orphan-validation.service.js';
import {PreValidationService} from '../phases/pre-validation.service.js';
import {ResponseBuilder} from '../phases/response-builder.js';
import {RoutingChangeStager} from '../phases/routing-change-stager.js';
import {SeedDetectionService} from '../phases/seed-detection.service.js';
import {DeletionReconstructionService} from '../services/deletion-reconstruction.service.js';
import {ManualUsecaseDependencyValidator} from '../services/manual-usecase-dependency-validator.js';
import {ManualMdfPrecedenceService} from '../services/manual-mdf-precedence.service.js';
import {MdfSubstitutionAnalyzer} from '../services/mdf-substitution-analyzer.js';

export function createRoutingEngine(): RoutingEngine {
  const manualDependencyValidator = new ManualUsecaseDependencyValidator();
  return new RoutingEngine(
    new PreValidationService(manualDependencyValidator),
    new TopologyChangeAnalysisService(
      new DeletionReconstructionService(),
      new ManualMdfPrecedenceService(),
      new MdfSubstitutionAnalyzer(),
    ),
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
