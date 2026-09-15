/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../../../../shared/filter/filter-expression.js';
import type {Result} from '../../../../shared/result/result.js';
import type {ComponentsReadModel} from './query-models/components-read-model.js';
import type {UsecaseChangeDetails} from './query-models/usecase-change-details-read-model.js';
import type {UseCaseReadModel} from './query-models/usecase-read-model.js';
import type {EmittedUsecaseChange} from '../../../../usecase-designer/use-case-creator/contracts/routing-state.js';

export interface UseCaseQueryService {
  getAllUseCases(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>>;
  getChangeDetails(
    fileId: number,
    emittedChanges: readonly EmittedUsecaseChange[],
  ): Promise<Result<UsecaseChangeDetails[]>>;
  /** @deprecated Use ComponentQueryService.getForUsecases instead */
  getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ComponentsReadModel>;
}
