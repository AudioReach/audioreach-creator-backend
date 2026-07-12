/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import {
  type InterfaceTypeValue,
  type InterfaceVersionValue,
  type ModuleTypeValue,
  ModuleTypeTransformer,
  InterfaceTypeTransformer,
  InterfaceVersionTransformer,
} from './types.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from '../definitions/module/spf/spf-module-definition.schema.js';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';

export interface ModuleManagerDataRow extends EntityBaseRow {
  // Foreign Keys
  moduleDefinitionSystemId: number;
  fileSystemId: number;

  // CAPI Registration Data
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;

  // Relations (optional, for TypeORM)
  moduleDefinition?: SpfModuleDefinitionRow;
  file?: ArcDbFileRow;
}

export const ModuleManagerDataSchema = new EntitySchema<ModuleManagerDataRow>({
  name: 'ModuleManagerData',
  tableName: 'module_manager_data',
  indices: [
    {
      name: 'uq_module_manager_data_module_definition',
      columns: ['moduleDefinitionSystemId'],
      unique: true,
    },
  ],
  columns: {
    ...BaseColumnSchemaPart,
    moduleDefinitionSystemId: {
      name: 'module_definition_system_id',
      type: 'integer',
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
    },
    moduleType: {
      name: 'module_type',
      type: 'integer',
      transformer: ModuleTypeTransformer,
    },
    interfaceType: {
      name: 'interface_type',
      type: 'integer',
      transformer: InterfaceTypeTransformer,
    },
    interfaceVersion: {
      name: 'interface_version',
      type: 'integer',
      transformer: InterfaceVersionTransformer,
    },
    fileName: {
      name: 'file_name',
      type: 'varchar',
      length: 255,
    },
    tag: {
      name: 'tag',
      type: 'varchar',
      length: 100,
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
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
});
