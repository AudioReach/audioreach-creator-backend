/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {KeyDefinitionRow} from './key-definition.schema.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ValueDefinitionBase {
  systemId: number;
  keySystemId: number;
  valueId: number;
  name: string;
  description?: string;
  enumMember?: string;
  specialValue?: string;
}

export interface ValueDefinitionRow extends EntityBaseRow, ValueDefinitionBase {
  keys: KeyDefinitionRow;
}

export const ValueDefinitionSchema = new EntitySchema<ValueDefinitionRow>({
  name: 'ValueDefinition',
  tableName: 'arc_values',
  columns: {
    ...BaseColumnSchemaPart,
    valueId: {
      name: 'value_id',
      type: 'integer',
      unique: false,
    },
    keySystemId: {
      name: 'keys_system_id',
      type: 'integer',
      nullable: false,
    },
    name: {
      name: 'name',
      type: 'text',
    },
    enumMember: {
      name: 'enum_member',
      type: 'text',
      nullable: true,
    },
    specialValue: {
      name: 'special_value',
      type: 'text',
      nullable: true,
    },
    description: {
      type: 'text',
      nullable: true,
    },
  },
  relations: {
    keys: {
      type: 'many-to-one',
      target: 'KeyDefinition',
      inverseSide: 'values',
      joinColumn: {name: 'keys_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_arc_values_keys_system_id',
      columns: ['keySystemId'],
    },
  ],
});
