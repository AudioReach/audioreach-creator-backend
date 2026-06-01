/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {ModuleDefinitionMetaDataRow} from './module-definition-meta-data.schema.js';
import type {DataPortGroupRow} from './data-group-definition.schema.js';
import type {ModuleAttributeRow} from './module-attribute.schema.js';
import type {StaticControlPortDefinitionRow} from './static-control-port-definition.schema.js';
import type {SpfModuleParameterDefinitionRow} from './spf-module-parameter-definition.schema.js';
import type {DynamicIntentDefinitionRow} from './dynamic-intent-definition.schema.js';
import type {SpfModuleRow} from '../../../usecase-data/module/spf-module.schema.js';
import type {ModuleDefinitionProcessorLinkRow} from './module-definition-processor-link.schema.js';
import type {ModuleDefinitionContainerTypeLinkRow} from './module-definition-container-type-link.schema.js';

export interface SpfModuleDefinitionRow extends EntityBaseRow {
  moduleDefinitionId: number;
  name: string;
  displayName?: string;
  description?: string;
  groupName?: string;
  modSearchKeys?: string;
  stackSize: number;
  fileSystemId: number;
  metadata?: string;
  isLoadedAtBootup: boolean;

  // Relations
  metaData?: ModuleDefinitionMetaDataRow;
  dataPortGroups?: DataPortGroupRow[];
  staticPorts?: StaticControlPortDefinitionRow[];
  dynamicIntents?: DynamicIntentDefinitionRow[];
  parameters: SpfModuleParameterDefinitionRow[];
  attributes?: ModuleAttributeRow[];
  processorLinks?: ModuleDefinitionProcessorLinkRow[];
  containerTypeLinks?: ModuleDefinitionContainerTypeLinkRow[];
  modules?: SpfModuleRow[];
}

export const SpfModuleDefinitionSchema =
  new EntitySchema<SpfModuleDefinitionRow>({
    name: 'SpfModuleDefinition',
    tableName: 'spf_module_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      moduleDefinitionId: {
        type: 'integer',
        name: 'module_definition_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        name: 'name',
      },
      displayName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'display_name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      groupName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'group_name',
      },
      modSearchKeys: {
        type: 'text',
        nullable: true,
        name: 'mod_search_keys',
      },
      stackSize: {
        type: 'integer',
        default: 0,
        name: 'stack_size',
      },
      fileSystemId: {
        type: 'integer',
        name: 'file_system_id',
      },
      metadata: {
        type: 'text',
        nullable: true,
        name: 'metadata',
      },
      isLoadedAtBootup: {
        name: 'is_loaded_at_bootup',
        type: 'boolean',
        default: false,
      },
    },
    relations: {
      // file: {
      //   type: 'many-to-one',
      //   target: 'File',
      //   joinColumn: {
      //     name: 'file_system_id',
      //     referencedColumnName: 'fileSystemId'
      //   }
      // },
      metaData: {
        type: 'one-to-one',
        target: 'ModuleDefinitionMetaData',
        inverseSide: 'moduleDefinition',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        cascade: ['insert', 'update'],
      },
      dataPortGroups: {
        type: 'one-to-many',
        target: 'DataPortGroup',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      staticPorts: {
        type: 'one-to-many',
        target: 'StaticControlPortDefinition',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      dynamicIntents: {
        type: 'one-to-many',
        target: 'DynamicIntentDefinition',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      parameters: {
        type: 'one-to-many',
        target: 'SpfModuleParameterDefinition',
        inverseSide: 'spfModuleDefinition',
        cascade: ['insert', 'update'],
      },
      attributes: {
        type: 'one-to-many',
        target: 'ModuleAttribute',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      processorLinks: {
        type: 'one-to-many',
        target: 'ModuleDefinitionProcessorLink',
        inverseSide: 'moduleDefinition',
      },
      containerTypeLinks: {
        type: 'one-to-many',
        target: 'ModuleDefinitionContainerTypeLink',
        inverseSide: 'moduleDefinition',
      },
      modules: {
        type: 'one-to-many',
        target: 'SpfModule',
        inverseSide: 'definition',
      },
    },
  });
