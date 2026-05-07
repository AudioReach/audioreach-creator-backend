/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DriverModuleDefinitionRow} from '../definitions/module/driver/driver-module-definition.schema.js';
import type {DriverModuleParameterDefinitionRow} from '../definitions/module/driver/driver-module-parameter-definition.schema.js';
import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import type {BlobBytesConverter} from '../usecase-data/module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../usecase-data/module/helper/bytes-transformer.js';
import type {ValueDefinitionRow} from '../definitions/key-value/value-definition.schema.js';
import {EntitySchema} from 'typeorm';

export interface DriverModuleRow extends EntityBaseRow {
  definitionSystemId: number;
  definition: DriverModuleDefinitionRow;
}

export interface DkvRow extends EntityBaseRow {
  driverModuleId: number;

  driverModule: DriverModuleRow;
  payloadCollection: DkvParameterPayloadRow[];
  values?: DkvValuesRow[]; // one-many — the key-value combination
}

export interface DkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array;

  dkvSystemId: number; // FK
  dkv?: DkvRow; // relation
  driverParameter?: DriverModuleParameterDefinitionRow;
}

export interface DkvValuesRow {
  dkvSystemId: number;
  valueDefSystemId: number;

  dkv?: DkvRow;
  valueDef?: ValueDefinitionRow;
}

export const DriverModuleSchema = new EntitySchema<DriverModuleRow>({
  name: 'DriverModule',
  tableName: 'driver_modules',
  columns: {
    ...BaseColumnSchemaPart,
    definitionSystemId: {
      name: 'definition_system_id',
      type: 'integer',
    },
  },
  relations: {
    definition: {
      type: 'many-to-one',
      target: 'DriverModuleDefinition',
      joinColumn: {
        name: 'definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
  },
  indices: [
    {
      name: 'idx_driver_modules_definition',
      columns: ['definitionSystemId'],
    },
  ],
});

export const DkvSchema = new EntitySchema<DkvRow>({
  name: 'Dkv',
  tableName: 'dkv',
  columns: {
    ...BaseColumnSchemaPart,
    driverModuleId: {
      name: 'module_instance_id',
      type: 'integer',
    },
  },
  relations: {
    driverModule: {
      type: 'many-to-one',
      target: 'DriverModule',
      joinColumn: {
        name: 'module_instance_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    payloadCollection: {
      type: 'one-to-many',
      target: 'DkvParameterPayload',
      inverseSide: 'dkv',
    },
    values: {
      type: 'one-to-many',
      target: 'DkvValues',
      inverseSide: 'dkv',
    },
  },
});

export const DkvParameterPayloadSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<DkvParameterPayloadRow>({
    name: 'DkvParameterPayload',
    tableName: 'dkv_parameter_payload',
    columns: {
      ...BaseColumnSchemaPart,
      parameterSystemId: {
        name: 'parameter_system_id',
        type: 'integer',
      },
      dkvSystemId: {
        name: 'dkv_system_id',
        type: 'integer',
      },
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      dkv: {
        type: 'many-to-one',
        target: 'Dkv',
        joinColumn: {
          name: 'dkv_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      driverParameter: {
        type: 'many-to-one',
        target: 'DriverModuleParameterDefinition',
        joinColumn: {
          name: 'parameter_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uk_dkv_parameter_payload',
        columns: ['dkvSystemId', 'parameterSystemId'],
        unique: true,
      },
    ],
  });

export const DkvValuesSchema = new EntitySchema<DkvValuesRow>({
  name: 'DkvValues',
  tableName: 'dkv_values',
  columns: {
    dkvSystemId: {name: 'dkv_system_id', type: 'integer', primary: true},
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
      primary: true,
    },
  },
  relations: {
    dkv: {
      type: 'many-to-one',
      target: 'Dkv',
      joinColumn: {name: 'dkv_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    valueDef: {
      type: 'many-to-one',
      target: 'ValueDefinition',
      joinColumn: {
        name: 'value_def_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
  },
});
