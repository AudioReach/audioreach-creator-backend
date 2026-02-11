/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';

import {EntitySchema} from 'typeorm';
import type {DataPortGroupRow} from './data-group-definition.schema.js';

export interface DataPortDefinitionRow extends EntityBaseRow {
  dataPortId: number;
  name?: string;

  // Foreign key relation
  dataPortGroupSystemId: number;

  //type orm relation
  dataPortGroup: DataPortGroupRow;
}
export const DataPortDefinitionSchema = new EntitySchema<DataPortDefinitionRow>(
  {
    name: 'DataPortDefinition',
    tableName: 'data_port_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      dataPortId: {
        type: 'integer',
        name: 'data_port_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      dataPortGroupSystemId: {
        type: 'integer',
        name: 'data_port_group_system_id',
      },
    },
    relations: {
      dataPortGroup: {
        type: 'many-to-one',
        target: 'DataPortGroup',
        inverseSide: 'ports',
        joinColumn: {
          name: 'data_port_group_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_data_port_definitions_group_id',
        columns: ['dataPortGroupSystemId'],
      },
    ],
  },
);
