/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from './node.schema.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ControlPortBase {
  systemId: number;
  portId: number;
  name?: string;
  isStatic: boolean;
  nodeSystemId: number;
}

export interface ControlPortRow extends EntityBaseRow, ControlPortBase {
  //type orm relation
  node: NodeRow;
  allocatedIntents?: IntentRow[];
}

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface IntentBase {
  systemId: number;
  intentId: number;
  controlPortSystemId: number;
}

export interface IntentRow extends EntityBaseRow, IntentBase {
  controlPort?: ControlPortRow;
}

export const ControlPortSchema = new EntitySchema<ControlPortRow>({
  name: 'ControlPort',
  tableName: 'control_ports',
  columns: {
    ...BaseColumnSchemaPart,
    portId: {
      type: 'integer',
      name: 'port_id',
    },
    name: {
      type: 'varchar',
      length: 255,
      nullable: true,
      name: 'name',
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
    allocatedIntents: {
      type: 'one-to-many',
      target: 'Intent',
      inverseSide: 'controlPort',
    },
  },
  indices: [
    {
      name: 'uk_control_port_node_port',
      columns: ['nodeSystemId', 'portId'],
      unique: true,
    },
  ],
});

export const IntentSchema = new EntitySchema<IntentRow>({
  name: 'Intent',
  tableName: 'intents',
  columns: {
    ...BaseColumnSchemaPart,
    intentId: {
      type: 'integer',
      name: 'intent_id',
    },
    controlPortSystemId: {
      type: 'integer',
      name: 'control_port_system_id',
    },
  },
  relations: {
    controlPort: {
      type: 'many-to-one',
      target: 'ControlPort',
      joinColumn: {
        name: 'control_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'uk_intent_control_port_intent',
      columns: ['controlPortSystemId', 'intentId'],
      unique: true,
    },
  ],
});
