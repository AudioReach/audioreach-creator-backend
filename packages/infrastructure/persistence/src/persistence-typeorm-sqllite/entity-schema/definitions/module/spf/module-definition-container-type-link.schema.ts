/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {
  JunctionColumnSchemaPart,
  type SystemIdRow,
} from '../../../entity-base.js';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import type {ContainerTypeRow} from '../../container/container-definition.schema.js';

/**
 * EntitySchema for the join table between SpfModuleDefinition and ContainerType.
 * Owns the table definition. FK constraints are enforced via many-to-one relations,
 * allowing BatchInserter to insert join rows without raw SQL.
 */
export interface ModuleDefinitionContainerTypeLinkRow extends SystemIdRow {
  moduleDefinitionSystemId: number;
  containerTypeSystemId: number;
  moduleDefinition?: SpfModuleDefinitionRow;
  containerType?: ContainerTypeRow;
}

export const ModuleDefinitionContainerTypeLinkSchema =
  new EntitySchema<ModuleDefinitionContainerTypeLinkRow>({
    name: 'ModuleDefinitionContainerTypeLink',
    tableName: 'module_definition_container_types',
    columns: {
      ...JunctionColumnSchemaPart,
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
      },
      containerTypeSystemId: {
        type: 'integer',
        name: 'container_type_system_id',
      },
    },
    relations: {
      moduleDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleDefinition',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      containerType: {
        type: 'many-to-one',
        target: 'ContainerType',
        joinColumn: {
          name: 'container_type_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uq_module_definition_container_types_definition_container',
        columns: ['moduleDefinitionSystemId', 'containerTypeSystemId'],
        unique: true,
      },
    ],
  });
