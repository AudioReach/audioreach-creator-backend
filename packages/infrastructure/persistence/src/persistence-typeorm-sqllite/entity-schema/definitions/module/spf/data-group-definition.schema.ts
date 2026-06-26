/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {DataPortDefinitionRow} from './data-port-definition.schema.js';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import {type PortIoType, PORT_IO_TYPE} from '@arc/core';

export interface DataPortGroupRow extends EntityBaseRow {
  maxAllowedPortCount: number;
  portIoType: PortIoType;

  // Foreign key relation
  moduleDefinitionSystemId: number;

  // Relations
  ports?: DataPortDefinitionRow[];

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const DataPortGroupSchema = new EntitySchema<DataPortGroupRow>({
  name: 'DataPortGroup',
  tableName: 'data_port_groups',
  columns: {
    ...BaseColumnSchemaPart,
    maxAllowedPortCount: {
      type: 'integer',
      default: 0,
      name: 'max_allowed_port_count',
    },
    portIoType: {
      name: 'port_io_type',
      type: 'simple-enum',
      enum: Object.values(PORT_IO_TYPE),
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
      joinColumn: {
        name: 'module_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    ports: {
      type: 'one-to-many',
      target: 'DataPortDefinition',
      inverseSide: 'dataPortGroup',
      cascade: ['insert', 'update'],
    },
  },
  indices: [
    {
      name: 'idx_data_port_groups_module_def_id',
      columns: ['moduleDefinitionSystemId'],
    },
  ],
});
