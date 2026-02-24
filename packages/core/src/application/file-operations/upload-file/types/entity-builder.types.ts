/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {JsonObject} from '../../../../shared/types/json-types.js';
import type {EntityBuilderKey} from '../../shared/constants/registry-keys.js';

/**
 * Specific input structure for entity building tasks
 */
export interface EntityBuilderInput {
  /** Type of entity to build (e.g., 'HEADER_ENTITY') */
  entityType: EntityBuilderKey;

  /**
   * Extracted data required for entity creation.
   * Must be a JSON-serializable object since it's transferred across worker boundaries.
   * The actual type depends on the entityType and is defined by each entity builder.
   * Examples: HeaderEntityData, KeyDefinitionData, etc.
   */
  requiredData: JsonObject;
}
