/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {ContainerRow} from '../container/container.schema.js';
import type {SubgraphRow} from '../subgraph/subgraph.schema.js';
import type {SpfModulePropertiesDataRow} from './spf-module-properties-data.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from '../../definitions/module/spf/spf-module-definition.schema.js';
import type {NodeRow} from '../node/node.schema.js';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {CkvRow} from './spf-module-calibration-data.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface SpfModuleBase {
  systemId: number;
  instanceId: number;
  alias: string | null;
  subgraphSystemId: number;
  containerSystemId: number;
  definitionSystemId: number;
  fileSystemId: number;
}

export interface SpfModuleRow extends EntityBaseRow, SpfModuleBase {
  // persistence-only relations (optional)
  subgraph?: SubgraphRow;
  container?: ContainerRow;
  definition?: SpfModuleDefinitionRow;
  spfModulePropertiesData?: SpfModulePropertiesDataRow[];

  // scope to file

  file?: ArcDbFileRow;

  // one-to-one relation to Node
  node?: NodeRow;
  //one-to-many
  ckvs?: CkvRow[];
}

export const SpfModuleSchema = new EntitySchema<SpfModuleRow>({
  name: 'SpfModule',
  tableName: 'spf_modules',
  columns: {
    ...BaseColumnSchemaPart,
    instanceId: {name: 'instance_id', type: 'integer'},
    alias: {type: 'varchar', length: 250},

    //  scalar FK columns you will set directly
    subgraphSystemId: {name: 'subgraph_system_id', type: 'integer'},
    containerSystemId: {name: 'container_system_id', type: 'integer'},
    definitionSystemId: {name: 'definition_system_id', type: 'integer'},

    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    //  bind relation to the FK column via joinColumn
    subgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'subgraph_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE', // delete subgraph => delete modules
    },
    container: {
      type: 'many-to-one',
      target: 'Container',
      joinColumn: {
        name: 'container_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE', //delete container => delete modules
    },
    definition: {
      type: 'many-to-one',
      target: 'SpfModuleDefinition',
      joinColumn: {
        name: 'definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT', // prevent deletion of definition if modules exist
    },
    spfModulePropertiesData: {
      type: 'one-to-many',
      target: 'SpfModulePropertiesData',
      inverseSide: 'module',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete modules
    },
    node: {
      type: 'one-to-one',
      target: 'Node',
      joinColumn: {
        name: 'system_id', // Use the PK column itself
        referencedColumnName: 'systemId', // Reference Node's PK
      },
      onDelete: 'CASCADE', // If Node is deleted, delete SpfModule
    },

    ckvs: {
      type: 'one-to-many',
      target: 'Ckv',
      inverseSide: 'module',
    },
  },
  indices: [
    {
      name: 'ix_spf_modules_subgraph_file_system',
      columns: ['subgraphSystemId', 'fileSystemId'],
    },
    {
      name: 'ix_spf_modules_container_file_system',
      columns: ['containerSystemId', 'fileSystemId'],
    },
    {
      name: 'ix_spf_modules_definition_file_system',
      columns: ['definitionSystemId', 'fileSystemId'],
    },
    {
      name: 'uq_spf_modules_instance_id_file_system_id',
      columns: ['instanceId', 'fileSystemId'],
      unique: true,
    },
  ],
});
