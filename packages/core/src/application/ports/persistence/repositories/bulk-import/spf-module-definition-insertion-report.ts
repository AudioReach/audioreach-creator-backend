/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {NaturalIdMapping, InsertError} from './insert-result.js';

/**
 * Module definition error entity types.
 */
export const MODULE_DEF_AGGREGATE_ENTITY_TYPES = {
  MODULE_DEFINITION: 'MODULE_DEFINITION',
  PARAMETER_DEFINITION: 'PARAMETER_DEFINITION',
  DATA_PORT_DEFINITION: 'DATA_PORT_DEFINITION',
  CONTROL_PORT_DEFINITION: 'CONTROL_PORT_DEFINITION',
  DYNAMIC_INTENT: 'DYNAMIC_INTENT',
} as const;

export type ModuleDefinitionInsertErrorEntity =
  (typeof MODULE_DEF_AGGREGATE_ENTITY_TYPES)[keyof typeof MODULE_DEF_AGGREGATE_ENTITY_TYPES];

export type ModuleDefinitionInsertError =
  InsertError<ModuleDefinitionInsertErrorEntity>;

/**
 * Module definition insert result.
 * Returns parameter definition mappings for calibration workflows.
 *
 * @example
 * ```typescript
 * const result: ModuleDefinitionInsertResult = {
 *   definitionIdMapping: { naturalId: 456, systemId: 789 },
 *   childMappings: {
 *     parameterDefinitions: [
 *       { naturalId: 'gain', systemId: 101 },
 *       { naturalId: 'volume', systemId: 102 }
 *     ]
 *   },
 *   errors: [],
 *   success: true
 * };
 * ```
 */
