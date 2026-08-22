/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {DriverModuleDefinitionRow} from './driver-module-definition.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface DriverModuleParameterDefinitionBase {
  systemId: number;
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // JSON
  copySrcParamId?: number;

  // Foreign key relation
  driverModuleDefinitionSystemId: number;
}

export interface DriverModuleParameterDefinitionRow
  extends EntityBaseRow, DriverModuleParameterDefinitionBase {
  driverModuleDefinition: DriverModuleDefinitionRow;
}

export const DriverModuleParameterDefinitionSchema =
  new EntitySchema<DriverModuleParameterDefinitionRow>({
    name: 'DriverModuleParameterDefinition',
    tableName: 'driver_module_parameter_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      parameterId: {
        type: 'integer',
        name: 'parameter_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      maxSize: {
        type: 'integer',
        name: 'max_size',
      },
      paramStructure: {
        type: 'text',
        name: 'param_structure',
      },
      copySrcParamId: {
        type: 'integer',
        nullable: true,
        name: 'copy_src_param_id',
      },
      driverModuleDefinitionSystemId: {
        type: 'integer',
        name: 'driver_module_definition_system_id',
        nullable: true,
      },
    },
    relations: {
      driverModuleDefinition: {
        type: 'many-to-one',
        target: 'DriverModuleDefinition',
        inverseSide: 'parameters',
        joinColumn: {
          name: 'driver_module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_driver_module_def_id',
        columns: ['driverModuleDefinitionSystemId'],
      },
    ],
  });
