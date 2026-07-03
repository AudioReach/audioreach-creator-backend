/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {ValueDefinitionRow} from './value-definition.schema.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';

/*
	Aggregate entity for key-definition
*/
export interface KeyDefinitionRow extends EntityBaseRow {
  // primary key
  systemId: number;

  // foreign key to arc_db_file
  fileSystemId: number;

  // member of key entity
  keyId: number;
  name: string;

  // used for generating C header files
  enumMember?: string;
  enumName?: string;
  description?: string;
  isVoice?: boolean;
  isDynamic?: boolean;
  isCalibrationKey?: boolean;
  isGraphKey?: boolean;
  specialityKeyValue?: string;
  calKeyEnumMember?: string;
  graphKeyEnumMember?: string;

  // base entity
  creationDate: Date;
  updateDate: Date;

  // Relations
  file?: ArcDbFileRow;
  values: ValueDefinitionRow[];
}

export const KeyDefinitionSchema = new EntitySchema<KeyDefinitionRow>({
  name: 'KeyDefinition',
  tableName: 'arc_keys',
  columns: {
    ...BaseColumnSchemaPart,
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    keyId: {
      name: 'key_id',
      type: 'integer',
      unique: false,
    },
    name: {
      name: 'name',
      type: 'text',
      unique: false,
    },
    enumMember: {
      name: 'enum_member',
      type: 'text',
      nullable: true,
    },
    enumName: {
      name: 'enum_name',
      type: 'text',
      nullable: true,
    },
    description: {
      type: 'text',
      nullable: true,
    },
    isVoice: {
      name: 'is_voice',
      type: 'boolean',
      nullable: true,
    },
    isDynamic: {
      name: 'is_dynamic',
      type: 'boolean',
      nullable: true,
    },
    isCalibrationKey: {
      name: 'is_calibration_key',
      type: 'boolean',
      nullable: true,
    },
    isGraphKey: {
      name: 'is_graph_key',
      type: 'boolean',
      nullable: true,
    },
    specialityKeyValue: {
      name: 'speciality_key_value',
      type: 'text',
      nullable: true,
    },
    calKeyEnumMember: {
      name: 'cal_key_enum_member',
      type: 'text',
      nullable: true,
    },
    graphKeyEnumMember: {
      name: 'graph_key_enum_member',
      type: 'text',
      nullable: true,
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    values: {
      type: 'one-to-many',
      target: 'ValueDefinition',
      inverseSide: 'keys',
      cascade: ['insert', 'update', 'remove'],
    },
  },
});
