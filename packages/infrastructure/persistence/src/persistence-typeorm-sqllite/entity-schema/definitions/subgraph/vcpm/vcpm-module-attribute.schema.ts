/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {VcpmModuleDefinitionRow} from './vcpm-module-definition.schema.js';

export interface VcpmModuleAttributeRow extends EntityBaseRow {
  name: string;
  value: string;

  // Foreign key relation
  vcpmModuleDefinitionSystemId: number;

  //type orm relation
  vcpmModuleDefinition: VcpmModuleDefinitionRow;
}

export const VcpmModuleAttributeSchema =
  new EntitySchema<VcpmModuleAttributeRow>({
    name: 'VcpmModuleAttribute',
    tableName: 'vcpm_module_attributes',
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
      vcpmModuleDefinitionSystemId: {
        type: 'integer',
        name: 'vcpm_module_definition_system_id',
      },
    },
    relations: {
      vcpmModuleDefinition: {
        type: 'many-to-one',
        target: 'VcpmModuleDefinition',
        inverseSide: 'attributes',
        joinColumn: {
          name: 'vcpm_module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_vcpm_module_attributes_vcpm_module_def_id',
        columns: ['vcpmModuleDefinitionSystemId'],
      },
    ],
  });
