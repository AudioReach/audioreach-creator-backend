/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {VcpmModuleParameterDefinitionRow} from './vcpm-module-parameter-definition.schema.js';
import type {VcpmInstanceRow} from '../../../usecase-data/subgraph/subgraph-vcpm-data.js';

export interface VcpmModuleDefinitionRow extends EntityBaseRow {
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;

  // Relations
  parameters: VcpmModuleParameterDefinitionRow[];
  vcpmInstances?: VcpmInstanceRow[];
}

export const VcpmModuleDefinitionSchema =
  new EntitySchema<VcpmModuleDefinitionRow>({
    name: 'VcpmModuleDefinition',
    tableName: 'vcpm_module_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      moduleDefinitionId: {
        type: 'integer',
        name: 'module_definition_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      groupName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'group_name',
      },
      fileSystemId: {
        type: 'integer',
        name: 'file_system_id',
      },
    },
    relations: {
      // file: {
      //   type: 'many-to-one',
      //   target: 'File',
      //   joinColumn: {
      //     name: 'file_system_id',
      //     referencedColumnName: 'fileSystemId'
      //   }
      // },

      parameters: {
        type: 'one-to-many',
        target: 'VcpmModuleParameterDefinition',
        inverseSide: 'vcpmModuleDefinition',
        cascade: ['insert', 'update'],
      },
      vcpmInstances: {
        type: 'one-to-many',
        target: 'VcpmInstance',
        inverseSide: 'vcpmDefinition',
      },
    },
  });
