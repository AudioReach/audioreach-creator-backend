/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RoutingEngine} from './routing-engine.js';
import {CombinationExpansionPhase} from '../phases/combination-expansion/combination-expansion.phase.js';
import {ConeComputationPhase} from '../phases/cone-computation.phase.js';
import {ClassificationPhase} from '../phases/classification/classification.phase.js';
import {TopologyChangeAnalysisPhase} from '../phases/topology-change-analysis/topology-change-analysis.phase.js';
import {IslandTransitionPhase} from '../phases/island-transition/island-transition.phase.js';
import {DfsRoutingPhase} from '../phases/dfs-routing/dfs-routing.phase.js';
import {KvResolutionPhase} from '../phases/kv-resolution.phase.js';
import {OrphanValidationPhase} from '../phases/orphan-validation.phase.js';
import {PreValidationPhase} from '../phases/pre-validation/pre-validation.phase.js';
import {ResponseBuilderPhase} from '../phases/response-builder.phase.js';
import {RoutingChangeStagingPhase} from '../phases/routing-change-staging/routing-change-staging.phase.js';
import {SeedDetectionPhase} from '../phases/seed-detection.phase.js';
import {DeletionReconstructionService} from '../phases/topology-change-analysis/deletion-reconstruction.service.js';
import {ManualUsecaseDependencyValidator} from '../phases/pre-validation/manual-usecase-dependency-validator.js';
import {ManualMdfPrecedenceService} from '../phases/topology-change-analysis/manual-mdf-precedence.service.js';
import {MdfSubstitutionAnalyzer} from '../phases/topology-change-analysis/mdf-substitution-analyzer.js';

export function createRoutingEngine(): RoutingEngine {
  const manualDependencyValidator = new ManualUsecaseDependencyValidator();
  return new RoutingEngine(
    new PreValidationPhase(manualDependencyValidator),
    new TopologyChangeAnalysisPhase(
      new DeletionReconstructionService(),
      new ManualMdfPrecedenceService(),
      new MdfSubstitutionAnalyzer(),
    ),
    new IslandTransitionPhase(),
    new KvResolutionPhase(),
    new SeedDetectionPhase(),
    new ConeComputationPhase(),
    new DfsRoutingPhase(),
    new CombinationExpansionPhase(),
    new ClassificationPhase(),
    new OrphanValidationPhase(),
    new RoutingChangeStagingPhase(),
    new ResponseBuilderPhase(),
  );
}
