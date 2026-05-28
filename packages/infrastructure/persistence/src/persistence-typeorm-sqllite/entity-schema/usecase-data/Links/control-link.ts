/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {SubgraphRow} from '../subgraph/subgraph.schema.js';
import type {ControlPortRow} from '../node/control-port.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {LinkType} from '@arc/core';
import {LINK_TYPE} from '@arc/core';
import {EntitySchema} from 'typeorm';

export interface ControlLinkRow extends EntityBaseRow {
  fileSystemId: number;
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  heapId: number;
  linkType: LinkType;
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;

  peerNodeA?: NodeRow;
  peerNodeB?: NodeRow;
  nodeAPort?: ControlPortRow;
  nodeBPort?: ControlPortRow;
  sourceSubgraph?: SubgraphRow;
  destSubgraph?: SubgraphRow;
  file?: ArcDbFileRow;
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
    heapId: {
      type: 'integer',
      name: 'heap_id',
    },
    linkType: {
      type: 'simple-enum',
      name: 'link_type',
      enum: Object.values(LINK_TYPE),
      nullable: false,
    },
    sourceSubgraphSystemId: {
      type: 'integer',
      name: 'source_subgraph_system_id',
      nullable: false,
    },
    destSubgraphSystemId: {
      type: 'integer',
      name: 'dest_subgraph_system_id',
      nullable: false,
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
    sourceSubgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'source_subgraph_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    destSubgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'dest_subgraph_system_id',
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
    {
      name: 'idx_control_links_src_sg_scope',
      columns: ['sourceSubgraphSystemId', 'linkType'],
    },
    {
      name: 'idx_control_links_dst_sg',
      columns: ['destSubgraphSystemId'],
    },
  ],
});
