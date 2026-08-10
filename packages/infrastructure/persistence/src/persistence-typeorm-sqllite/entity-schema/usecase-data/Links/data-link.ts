/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {DataPortRow} from '../node/data-port-info.schema.js';
import type {SubgraphRow} from '../subgraph/subgraph.schema.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {LinkType} from '@arc/core';
import {LINK_TYPE} from '@arc/core';
import {EntitySchema} from 'typeorm';

/** Minimal link-port pair returned by port-level link counting overlay. */
export interface LinkOverlayEntry {
  linkSystemId: number;
  portSystemId: number;
}

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface DataLinkBase {
  systemId: number;
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  linkType: LinkType;
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
  isEc: boolean | null;
  fileSystemId: number;
}

export interface DataLinkRow extends EntityBaseRow, DataLinkBase {
  sourceNode?: NodeRow;
  destinationNode?: NodeRow;
  sourcePort?: DataPortRow;
  destinationPort?: DataPortRow;
  sourceSubgraph?: SubgraphRow;
  destSubgraph?: SubgraphRow;
  file?: ArcDbFileRow;
}

export const DataLinkSchema = new EntitySchema<DataLinkRow>({
  name: 'DataLink',
  tableName: 'data_links',
  columns: {
    ...BaseColumnSchemaPart,
    sourceNodeSystemId: {
      type: 'integer',
      name: 'source_node_system_id',
    },
    destinationNodeSystemId: {
      type: 'integer',
      name: 'destination_node_system_id',
    },
    sourcePortSystemId: {
      type: 'integer',
      name: 'source_port_system_id',
    },
    destinationPortSystemId: {
      type: 'integer',
      name: 'destination_port_system_id',
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
    isEc: {
      type: 'integer',
      name: 'is_ec',
      nullable: true,
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
  },
  relations: {
    sourceNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'source_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    destinationNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'destination_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    sourcePort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'source_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    destinationPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'destination_port_system_id',
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
      name: 'uk_data_link_ports',
      columns: ['sourcePortSystemId', 'destinationPortSystemId'],
      unique: true,
    },
    {
      name: 'idx_data_links_src_sg_scope',
      columns: ['sourceSubgraphSystemId', 'linkType'],
    },
    {
      name: 'idx_data_links_dst_sg',
      columns: ['destSubgraphSystemId'],
    },
  ],
});
