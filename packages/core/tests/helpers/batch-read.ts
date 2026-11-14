/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BatchRead,
  FailedEntity,
} from '../../src/application/ports/persistence/batch-read.js';
import {FAILED_ENTITY_REASON} from '../../src/application/ports/persistence/batch-read.js';
import type {EntityType} from '../../src/shared/entity-type.js';

/** A batch read result, for mocking query services and repositories. */
export function batchOf<T, E extends EntityType>(
  entityType: E,
  items: T[],
  failed: FailedEntity<E>[] = [],
): BatchRead<T, E> {
  return {entityType, items, failed};
}

/** A batch read in which every requested systemId was not found. */
export function notFoundBatch<E extends EntityType>(
  entityType: E,
  ...systemIds: number[]
): BatchRead<never, E> {
  return batchOf(
    entityType,
    [],
    systemIds.map(systemId => ({
      systemId,
      reason: FAILED_ENTITY_REASON.NotFound,
    })),
  );
}
