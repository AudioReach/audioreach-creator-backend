/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead} from '../../ports/persistence/batch-read.js';
import type {EntityType} from '../../../shared/entity-type.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';
import {failedToIssues} from './failed-to-issues.js';

/**
 * Returns the items of a batch read, for commands that need every
 * requested entity.
 *
 * Throws `ResourceNotFoundException` (404) when any entity could not be
 * loaded, with one issue per failed entity.
 */
export function requireAll<T, E extends EntityType>(
  batch: BatchRead<T, E>,
): T[] {
  if (batch.failed.length === 0) return batch.items;
  throw new ResourceNotFoundException(
    `Could not load every ${batch.entityType}`,
    failedToIssues(batch),
  );
}
