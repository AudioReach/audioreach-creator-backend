/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {ControlPortRow} from '../node/control-port.js';
import type {ControlLinkRow} from './control-link.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';

export interface SubsystemControlLinkRow extends EntityBaseRow {
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  controlLinkSystemId: number;
  fileSystemId: number;

  peerNodeA?: NodeRow;
  peerNodeB?: NodeRow;
  nodeAPort?: ControlPortRow;
  nodeBPort?: ControlPortRow;
  controlLink?: ControlLinkRow;
  file?: ArcDbFileRow;
}

export const SubsystemControlLinkSchema =
  new EntitySchema<SubsystemControlLinkRow>({
    name: 'SubsystemControlLink',
    tableName: 'subsystem_control_links',
    columns: {
      ...BaseColumnSchemaPart,
      peerNodeASystemId: {
        name: 'peer_nodeA_system_id',
        type: 'integer',
        nullable: false,
      },
      peerNodeBSystemId: {
        name: 'peer_nodeB_system_id',
        type: 'integer',
        nullable: false,
      },
      nodeAPortSystemId: {
        name: 'nodeA_port_system_id',
        type: 'integer',
        nullable: false,
      },
      nodeBPortSystemId: {
        name: 'nodeB_port_system_id',
        type: 'integer',
        nullable: false,
      },
      controlLinkSystemId: {
        name: 'control_link_system_id',
        type: 'integer',
        nullable: false,
      },
      fileSystemId: {
        name: 'file_system_id',
        type: 'integer',
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
      controlLink: {
        type: 'many-to-one',
        target: 'ControlLink',
        joinColumn: {
          name: 'control_link_system_id',
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
        name: 'idx_scl_file',
        columns: ['fileSystemId'],
      },
      {
        name: 'idx_scl_control_link',
        columns: ['controlLinkSystemId'],
      },
      {
        name: 'idx_scl_nodeA_port_file',
        columns: ['nodeAPortSystemId', 'fileSystemId'],
      },
      {
        name: 'idx_scl_nodeB_port_file',
        columns: ['nodeBPortSystemId', 'fileSystemId'],
      },
    ],
  });
