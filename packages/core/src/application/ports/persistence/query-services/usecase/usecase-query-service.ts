/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../../../../shared/filter/filter-expression.js';
import type {Result} from '../../../../shared/result/result.js';
import type {ComponentsReadModel} from './query-models/components-read-model.js';
import type {UsecaseChangeDetails} from './query-models/usecase-change-details-read-model.js';
import type {UseCaseReadModel} from './query-models/usecase-read-model.js';
import type {UsecaseFilteredGkvData} from '../../../../services/subsystem-filtered-gkv-service.js';
import type {UsecaseChangeDescriptor} from '../../../../usecase-designer/use-case-creator/contracts/routing-state.js';

export interface UseCaseQueryService {
  getAllUseCases(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>>;
  getChangeDetails(
    fileId: number,
    emittedChanges: readonly UsecaseChangeDescriptor[],
  ): Promise<Result<UsecaseChangeDetails[]>>;
  /** @deprecated Use ComponentQueryService.getForUsecases instead */
  getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ComponentsReadModel>;

  /**
   * Loads effective data for the core subsystem-filtered GKV algorithm.
   */
  getUsecaseFilteredGkvData(
    fileId: number,
  ): Promise<Result<UsecaseFilteredGkvData>>;
}
