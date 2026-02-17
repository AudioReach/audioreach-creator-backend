/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Specific input structure for entity building tasks
 */
export interface EntityBuilderInput {
  /** Type of entity to build (e.g., 'HEADER_ENTITY') */
  entityType: string;

  /**
   * Extracted data required for entity creation.
   * The actual type depends on the entityType and is defined by each entity builder.
   * Examples: HeaderEntityData, KeyDefinitionData, etc.
   */
  requiredData: unknown;
}
