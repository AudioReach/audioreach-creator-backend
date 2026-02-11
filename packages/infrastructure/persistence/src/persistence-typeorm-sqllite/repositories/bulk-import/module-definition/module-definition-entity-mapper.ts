/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleDefinition} from '@arc/core';
import type {SpfModuleDefinitionRow} from '../../../entity-schema/index.js';

/**
 * Maps ModuleDefinition domain entity to SpfModuleDefinitionRow for database insertion.
 * Uses type assertion for missing audit fields (creationDate, updateDate) as they will be handled by the database.
 *
 * @param moduleDefinition - ModuleDefinition domain entity without systemId
 * @returns SpfModuleDefinitionRow ready for batch insertion
 */
export function toSpfModuleDefinitionRow(
  moduleDefinition: Omit<ModuleDefinition, 'systemId'>,
): SpfModuleDefinitionRow {
  return {
    moduleDefinitionId: moduleDefinition.moduleDefinitionId,
    name: moduleDefinition.name,
    displayName: moduleDefinition.displayName,
    description: moduleDefinition.description,
    groupName: moduleDefinition.groupName,
    fileSystemId: moduleDefinition.fileSystemId,
    stackSize: 0, // Default value as per schema
  } as SpfModuleDefinitionRow;
}
