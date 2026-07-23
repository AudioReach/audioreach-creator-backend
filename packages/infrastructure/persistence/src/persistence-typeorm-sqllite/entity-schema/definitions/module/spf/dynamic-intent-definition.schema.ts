/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';

/** Scalar columns only — used by overlay fetchers. */
export interface DynamicIntentDefinitionBase {
  systemId: number;
  intentId: number;
  name: string;
  maxPort: number;
  moduleDefinitionSystemId: number;
}

export interface DynamicIntentDefinitionRow
  extends EntityBaseRow, DynamicIntentDefinitionBase {
  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const DynamicIntentDefinitionSchema =
  new EntitySchema<DynamicIntentDefinitionRow>({
    name: 'DynamicIntentDefinition',
    tableName: 'dynamic_intent_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      intentId: {
        type: 'integer',
        name: 'intent_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      maxPort: {
        type: 'integer',
        nullable: true,
        name: 'max_port',
      },
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
      },
    },
    relations: {
      moduleDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleDefinition',
        inverseSide: 'dynamicIntents',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_dynamic_intent_defs_module_def_id',
        columns: ['moduleDefinitionSystemId'],
      },
    ],
  });
