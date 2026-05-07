/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {KeyDefinitionRow} from './key-definition.schema.js';
import {EntitySchema} from 'typeorm';

export interface ValueDefinitionRow extends EntityBaseRow {
  systemId: number;
  keySystemId: number;
  valueId: number;
  valueName: string;
  description?: string;
  cEnumMemberName?: string;
  creationDate: Date;
  updateDate: Date;

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
    valueName: {
      name: 'value_name',
      type: 'text',
    },
    cEnumMemberName: {
      name: 'key_enum_value',
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
