/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import type {ProcessorDefinitionRow} from '../../common/processor-definition.schema.js';

/**
 * EntitySchema for the join table between SpfModuleDefinition and ProcessorDefinition.
 * Owns the table definition. FK constraints are enforced via many-to-one relations,
 * allowing BatchInserter to insert join rows without raw SQL.
 */
export interface ModuleDefinitionProcessorLinkRow {
  moduleDefinitionSystemId: number;
  processorDefinitionSystemId: number;
  moduleDefinition?: SpfModuleDefinitionRow;
  processorDefinition?: ProcessorDefinitionRow;
}

export const ModuleDefinitionProcessorLinkSchema =
  new EntitySchema<ModuleDefinitionProcessorLinkRow>({
    name: 'ModuleDefinitionProcessorLink',
    tableName: 'module_definition_processor_definitions',
    columns: {
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
        primary: true,
      },
      processorDefinitionSystemId: {
        type: 'integer',
        name: 'processor_definition_system_id',
        primary: true,
      },
    },
    relations: {
      moduleDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleDefinition',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      processorDefinition: {
        type: 'many-to-one',
        target: 'ProcessorDefinition',
        joinColumn: {
          name: 'processor_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
  });
