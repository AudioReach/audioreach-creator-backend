/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {type PortIoType, PORT_IO_TYPE} from '@arc/core';
import {EntitySchema} from 'typeorm';
import type {NodeRow} from './node.schema.js';

export interface DataPortRow extends EntityBaseRow {
  dataPortId: number;
  name?: string;
  portIoType: PortIoType;
  isStatic: boolean;

  // Foreign key relation
  nodeSystemId: number;

  //type orm relation
  node?: NodeRow;
}

export const DataPortSchema = new EntitySchema<DataPortRow>({
  name: 'DataPort',
  tableName: 'data_ports',
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
    portIoType: {
      type: 'simple-enum',
      enum: Object.values(PORT_IO_TYPE),
      name: 'port_io_type',
    },
    isStatic: {
      type: 'boolean',
      name: 'is_static',
    },
    nodeSystemId: {
      type: 'integer',
      name: 'node_system_id',
    },
  },
  relations: {
    node: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
});
