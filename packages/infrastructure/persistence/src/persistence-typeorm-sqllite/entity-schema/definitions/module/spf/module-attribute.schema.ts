/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';

export interface ModuleAttributeRow extends EntityBaseRow {
  name: string;
  value: string;

  // Foreign key relation
  moduleDefinitionSystemId: number;

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const ModuleAttributeSchema = new EntitySchema<ModuleAttributeRow>({
  name: 'ModuleAttribute',
  tableName: 'module_attributes',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      name: 'name',
    },
    value: {
      type: 'varchar',
      length: 500,
      name: 'value',
    },
    moduleDefinitionSystemId: {
      type: 'integer',
      name: 'module_definition_system_id',
    },
  },
  relations: {
    moduleDefinition: {
      type: 'many-to-one',
      target: 'SpfModuleDefinition',
      inverseSide: 'attributes',
      joinColumn: {
        name: 'module_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_module_attributes_module_def_id',
      columns: ['moduleDefinitionSystemId'],
    },
  ],
});
