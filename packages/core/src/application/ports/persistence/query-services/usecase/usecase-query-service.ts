/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../../../../shared/filter/filter-expression.js';
import type {Result} from '../../../../shared/result/result.js';
import type {UseCaseReadModel} from './query-models/usecase-read-model.js';
import type {ComponentsReadModel} from './query-models/components-read-model.js';

/**
 * Query service interface for use case queries
 */
export interface UseCaseQueryService {
  /**
   * Get all use cases with their global key vectors for a specific file.
   * @param fileId    The file system ID to filter use cases by
   * @param filter    Optional filter expression — applied at DB level via ParamFilter
   */
  getAllUseCases(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<Result<UseCaseReadModel[]>>;

  /**
   * Get all components (modules, data links, control links) for given use cases.
   * @deprecated Use ComponentQueryService.getForUsecases instead
   */
  getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ComponentsReadModel>;

  /**
   * Returns the usecase system IDs that contain at least one of the given subgraph IDs.
   * Used for link-type derivation (INTRA_USECASE vs INTER_USECASE).
   * Empty input returns an empty map immediately.
   */
  findUsecaseIdsBySubgraphIds(
    subgraphIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, number[]>>;
}
