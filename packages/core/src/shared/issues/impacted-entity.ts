/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityType} from '../entity-type.js';

export interface ImpactedEntity {
  /** The type of entity that has the issue. */
  entityType: EntityType;
  systemId: number;
  /** Human-readable name for display (e.g., module alias). */
  displayName?: string;
}
