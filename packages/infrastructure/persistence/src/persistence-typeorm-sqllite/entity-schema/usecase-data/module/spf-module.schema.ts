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

export interface SpfModuleRow extends EntityBaseRow {
  instanceId: number;
  alias: string;

  // FKs(scalar columns you will set directly on writes)
  subgraphSystemId: number;
  containerSystemId: number;
  definitionSystemId: number;

  // persistence-only relations (optional)
  subgraph?: SubgraphRow;
  container?: ContainerRow;
  definition?: SpfModuleDefinitionRow;
  spfModulePropertiesData?: SpfModulePropertiesDataRow[];

  // scope to file
  fileSystemId: number;
  file?: ArcDbFileRow;

  // one-to-one relation to Node
  node?: NodeRow;
}

export const SpfModuleSchema = new EntitySchema<SpfModuleRow>({
  name: 'SpfModule',
  tableName: 'spf_modules',
  columns: {
    ...BaseColumnSchemaPart,
    // Override systemId to NOT be auto-generated (will use Node's systemId)
    systemId: {
      name: 'system_id',
      type: 'integer',
      primary: true,
      // No 'generated' property - will be provided from Node
    },
    instanceId: {name: 'instance_id', type: 'integer'},
    alias: {type: 'varchar', length: 256},

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
