/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {DriverModuleParameterDefinitionRow} from './driver-module-parameter-definition.schema.js';
import type {ArcDbFileRow} from '../../../project-data/arc-db-file.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface DriverModuleDefinitionBase {
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;
}

export interface DriverModuleDefinitionRow
  extends EntityBaseRow, DriverModuleDefinitionBase {
  // Relations
  parameters: DriverModuleParameterDefinitionRow[];
  file?: ArcDbFileRow;
}

export const DriverModuleDefinitionSchema =
  new EntitySchema<DriverModuleDefinitionRow>({
    name: 'DriverModuleDefinition',
    tableName: 'driver_module_definitions',
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
      parameters: {
        type: 'one-to-many',
        target: 'DriverModuleParameterDefinition',
        inverseSide: 'driverModuleDefinition',
        cascade: ['insert', 'update'],
      },
      file: {
        type: 'many-to-one',
        target: 'ArcDbFile',
        joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
        onDelete: 'CASCADE',
      },
    },
  });
