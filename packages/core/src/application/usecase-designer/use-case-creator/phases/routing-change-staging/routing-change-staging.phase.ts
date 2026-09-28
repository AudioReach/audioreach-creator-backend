/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../../application/shared/result/result.js';
import {SOURCE} from '../../../../shared/change-vocabulary.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {UnitOfWork} from '../../../../ports/persistence/unit-of-work.js';
import type {RoutingContext} from '../../contracts/routing-context.js';
import type {UsecaseChangeDescriptor} from '../../contracts/routing-state.js';
import {ClassifiedCandidateStager} from './classified-candidate-stager.js';
import {
  TopologyChangeStager,
  type StagingState,
} from './topology-change-stager.js';

/**
 * Converts finalized routing decisions into atomic repository writes.
 *
 * MDF substitutions are staged before ordinary deletion and candidate writes. Descriptor
 * coalescing keeps the response tied to persisted aggregate changes, not intermediate state.
 */
export class RoutingChangeStagingPhase {
  constructor(
    private readonly topologyChangeStager = new TopologyChangeStager(),
    private readonly classifiedCandidateStager = new ClassifiedCandidateStager(),
  ) {}

  async run(
    context: RoutingContext,
    uow: UnitOfWork,
    idGenerator: IdGenerationPort,
  ): Promise<ResultType<void>> {
    const analysis = context.topologyChangeAnalysis;
    if (analysis === null) {
      throw new Error('Topology change analysis must run before staging');
    }

    const staging: StagingState = {
      repository: uow.getUsecaseRepository(),
      options: {source: SOURCE.AutoRouting},
      descriptors: new Map<number, UsecaseChangeDescriptor>(),
    };
    const topologyResult = await this.topologyChangeStager.stage({
      analysis,
      islandTransitions: context.islandTransitions,
      staging,
    });
    if (topologyResult.kind === RESULT_KIND.Fail) return topologyResult;

    const candidateResult = await this.classifiedCandidateStager.stage({
      classifications: context.classifiedUcs,
      staging,
      fileSystemId: context.input.fileSystemId,
      snapshot: context.input.graphSnapshot,
      idGenerator,
    });
    if (candidateResult.kind === RESULT_KIND.Fail) return candidateResult;

    context.emittedUcChanges.push(...staging.descriptors.values());
    return Result.ok();
  }
}
