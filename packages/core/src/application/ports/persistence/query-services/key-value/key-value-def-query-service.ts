/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionReadModel} from './key-value-definition-read-model.js';
import type {Result} from '../../../../shared/Result/operation-result.js';

export interface KeyValueDefQueryService {
  /**
   * Given a value systemId, returns its parent KeyDefinitionReadModel —
   * key fields plus ALL child values under that key (not just the requested
   * one). Resolution order: DB row first, then session overlay. Result.fail
   * with ERROR_CODES.ENTITY_NOT_FOUND only if both come up empty.
   */
  getKeyValueDefinitionForGivenValue(
    valueDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>>;

  /**
   * Batch variant — resolves many valueDefSystemIds in two DB queries total
   * (not one per id, not one per distinct key), instead of one
   * getKeyValueDefinitionForGivenValue call per id.
   *
   * Returns the distinct parent KeyDefinitionReadModels for the requested
   * ids, deduped by key systemId. Each returned key carries ALL its child
   * values. Ids that don't resolve (absent from DB and overlay) are
   * silently omitted from the result.
   *
   * Outer Result fails only if a batch DB query itself throws.
   */
  getKeyValueDefinitionForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel[]>>;

  /**
   * Given a key systemId, returns the overlaid KeyDefinitionReadModel with
   * all its child values. Resolution order: DB row first, then session
   * overlay. Result.fail with ERROR_CODES.ENTITY_NOT_FOUND only if both
   * come up empty.
   */
  getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
  ): Promise<Result<KeyDefinitionReadModel>>;
}
