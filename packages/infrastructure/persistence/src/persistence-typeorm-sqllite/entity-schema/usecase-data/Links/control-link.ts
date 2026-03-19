/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {UseCaseRow} from '../use-case.js';
import {EntitySchema} from 'typeorm';
import type {ControlPortRow} from '../node/control-port.js';

export interface ControlLinkRow extends EntityBaseRow {
  fileSystemId: number;
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  intents: number[];
  heapId: number;
  isInterGraph: boolean;

  peerNodeA?: NodeRow;
  peerNodeB?: NodeRow;
  nodeAPort?: ControlPortRow;
  nodeBPort?: ControlPortRow;
  useCases?: UseCaseRow[];
}

export const ControlLinkSchema = new EntitySchema<ControlLinkRow>({
  name: 'ControlLink',
  tableName: 'control_links',
  columns: {
    ...BaseColumnSchemaPart,
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    peerNodeASystemId: {
      type: 'integer',
      name: 'peer_nodeA_system_id',
    },
    peerNodeBSystemId: {
      type: 'integer',
      name: 'peer_nodeB_system_id',
    },
    nodeAPortSystemId: {
      type: 'integer',
      name: 'nodeA_port_system_id',
    },
    nodeBPortSystemId: {
      type: 'integer',
      name: 'nodeB_port_system_id',
    },
    intents: {
      type: 'simple-json',
      name: 'intents',
    },
    heapId: {
      type: 'integer',
      name: 'heap_id',
    },
    isInterGraph: {
      type: 'boolean',
      name: 'is_inter_graph',
    },
  },
  relations: {
    peerNodeA: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'peer_nodeA_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    peerNodeB: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'peer_nodeB_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    nodeAPort: {
      type: 'many-to-one',
      target: 'ControlPort',
      joinColumn: {
        name: 'nodeA_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    nodeBPort: {
      type: 'many-to-one',
      target: 'ControlPort',
      joinColumn: {
        name: 'nodeB_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'controlLinks',
    },
  },
  indices: [
    {
      name: 'uk_control_link_unique',
      columns: [
        'peerNodeASystemId',
        'peerNodeBSystemId',
        'nodeAPortSystemId',
        'nodeBPortSystemId',
      ],
      unique: true,
    },
  ],
});
