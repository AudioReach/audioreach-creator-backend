/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../../../../shared/filter/filter-expression.js';
import type {BatchRead} from '../../batch-read.js';
import type {ReadOptions} from '../../repositories/shared/read-options.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseChangeDetails} from './query-models/usecase-change-details-read-model.js';
import type {UseCaseReadModel} from './query-models/usecase-read-model.js';
import type {UsecaseFilteredTopologyData} from '../../../../services/subsystem-filtered-gkv-service.js';
import type {UsecaseChangeDescriptor} from '../../../../usecase-designer/use-case-creator/contracts/routing-state.js';

/** Narrows `findUseCaseReadModels`. Both fields combine with AND. */
export interface UseCaseReadModelQuery {
  /**
   * Only these use cases. An empty list returns no use cases. Requested
   * IDs that do not exist are reported as `NOT_FOUND`; IDs that exist but
   * do not match `filter` are simply left out.
   */
  readonly ids?: readonly number[];
  readonly filter?: FilterExpression;
}

/**
 * Use-case reads. All methods throw on infrastructure errors.
 */
export interface UseCaseQueryService {
  /**
   * Loads use cases with their GKV key and value names resolved. A use case
   * whose GKV value definition is missing is reported in `failed` as
   * `UNRESOLVED_REFERENCE` (part `gkv`).
   */
  findUseCaseReadModels(
    fileSystemId: number,
    query?: UseCaseReadModelQuery,
  ): Promise<BatchRead<UseCaseReadModel>>;
  /**
   * Builds committed-versus-session snapshots for the emitted changes, one
   * per descriptor in order. All or nothing: throws if any snapshot cannot
   * be built (inconsistent boundary or unresolved GKV value).
   */
  findUseCaseChangeDetails(
    fileSystemId: number,
    emittedChanges: readonly UsecaseChangeDescriptor[],
  ): Promise<UsecaseChangeDetails[]>;
  /** Loads the effective topology required to pre-filter usecases by subsystem. */
  findUseCaseFilteredTopologyData(
    fileSystemId: number,
  ): Promise<UsecaseFilteredTopologyData>;

  /**
   * Returns the UCs on `fileSystemId` whose `systemId` is in `ucSystemIds`.
   * Empty input → no items. Missing IDs are reported in `failed` as
   * `NOT_FOUND`.
   *
   * `readMode` defaults to `READ_MODE.Overlay`; committed mode ignores
   * session edits.
   */
  findUseCases(
    fileSystemId: number,
    ucSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<BatchRead<UseCase>>;

  /**
   * Returns UCs on `fileSystemId` that contain at least one of the given
   * subgraphs, each UC once. Empty input → []. `readMode` defaults to
   * `READ_MODE.Overlay`.
   */
  findUseCasesBySubgraphs(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<UseCase[]>;

  /**
   * Returns all UCs on `fileSystemId`. `readMode` defaults to
   * `READ_MODE.Overlay`. Committed mode returns pre-session state; callers
   * can filter the returned collection in memory.
   */
  findAllUseCases(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<UseCase[]>;
}
