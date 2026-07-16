/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionRow} from '../../definitions/key-value/key-definition.schema.js';
import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {NodeRow} from '../node/node.schema.js';

export interface SubsystemRow extends EntityBaseRow {
  name: string;
  subsystemId?: number;

  // one-to-one relation to Node
  node?: NodeRow;
}

export interface SubsystemFilteredKeyRow {
  subsystemsSystemId: number;
  keyDefinitionSystemId: number;

  subsystem?: SubsystemRow;
  keyDefinition?: KeyDefinitionRow;
}

export const SubsystemSchema = new EntitySchema<SubsystemRow>({
  name: 'Subsystem',
  tableName: 'subsystems',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
    },
    subsystemId: {
      type: 'integer',
      nullable: true,
      name: 'subsystem_id',
    },
  },
  relations: {
    node: {
      type: 'one-to-one',
      target: 'Node',
      joinColumn: {
        name: 'system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
});

export const SubsystemFilteredKeySchema =
  new EntitySchema<SubsystemFilteredKeyRow>({
    name: 'SubsystemFilteredKey',
    tableName: 'subsystem_filtered_keys_key_definition',
    columns: {
      subsystemsSystemId: {
        name: 'subsystems_system_id',
        type: 'integer',
        primary: true,
      },
      keyDefinitionSystemId: {
        name: 'key_definition_system_id',
        type: 'integer',
        primary: true,
      },
    },
    relations: {
      subsystem: {
        type: 'many-to-one',
        target: 'Subsystem',
        joinColumn: {
          name: 'subsystems_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      keyDefinition: {
        type: 'many-to-one',
        target: 'KeyDefinition',
        joinColumn: {
          name: 'key_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
  });
