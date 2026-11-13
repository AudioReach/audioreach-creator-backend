/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead} from '../../ports/persistence/batch-read.js';
import {FAILED_ENTITY_REASON} from '../../ports/persistence/batch-read.js';
import type {IssueEntityType} from '../../../shared/issues/impacted-entity.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';
import {failedToIssues} from './failed-to-issues.js';

/**
 * Returns the entity a batch read of one `systemId` loaded, for handlers
 * that read a single entity.
 *
 * Throws `ResourceNotFoundException` (404) when the entity could not be
 * loaded, whether it is missing or references a missing entity; the issue
 * says which.
 */
export function requireOne<T, E extends IssueEntityType>(
  entityType: E,
  systemId: number,
  batch: BatchRead<T, E>,
): T {
  const item = batch.items.at(0);
  if (item !== undefined) return item;

  const failed =
    batch.failed.length > 0
      ? batch.failed
      : [{systemId, reason: FAILED_ENTITY_REASON.NotFound}];
  const issues = failedToIssues(entityType, failed);
  const displayName = issues[0]?.impactedEntity?.displayName ?? entityType;
  throw new ResourceNotFoundException(`Could not load ${displayName}`, issues);
}
