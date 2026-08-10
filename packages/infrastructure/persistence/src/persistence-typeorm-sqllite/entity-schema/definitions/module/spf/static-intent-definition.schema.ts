/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {StaticControlPortDefinitionRow} from './static-control-port-definition.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface StaticIntentDefinitionBase {
  systemId: number;
  intentId: number;
  name: string;
  staticControlPortDefinitionSystemId: number;
}

export interface StaticIntentDefinitionRow
  extends EntityBaseRow, StaticIntentDefinitionBase {
  staticControlPortDefinition: StaticControlPortDefinitionRow;
}

export const StaticIntentDefinitionSchema =
  new EntitySchema<StaticIntentDefinitionRow>({
    name: 'StaticIntentDefinition',
    tableName: 'static_intent_definitions',
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
      staticControlPortDefinitionSystemId: {
        type: 'integer',
        name: 'static_control_port_definition_system_id',
      },
    },
    relations: {
      staticControlPortDefinition: {
        type: 'many-to-one',
        target: 'StaticControlPortDefinition',
        inverseSide: 'staticIntents',
        joinColumn: {
          name: 'static_control_port_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_static_intent_defs_port_id',
        columns: ['staticControlPortDefinitionSystemId'],
      },
    ],
  });
