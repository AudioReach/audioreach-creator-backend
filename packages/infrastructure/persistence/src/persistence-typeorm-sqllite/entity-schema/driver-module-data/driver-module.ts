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
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';

export interface DriverModuleRow extends EntityBaseRow {
  // FKs (scalar columns you will set directly on writes)
  definitionSystemId: number;

  // persistence-only relations (optional)
  definition?: DriverModuleDefinitionRow;

  // scope to file
  fileSystemId: number;
  file?: ArcDbFileRow;

  // one-to-many
  dkvs?: DkvRow[];
}

export interface DkvRow extends EntityBaseRow {
  driverModuleSystemId: number;

  driverModule?: DriverModuleRow; // many-one
  payloadCollection: DkvParameterPayloadRow[]; // one-many
  values?: DkvValuesRow[]; // one-many — the key-value combination that identifies this calibration bin
}

export interface DkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array | null;

  dkvSystemId: number; // FK
  dkv?: DkvRow; // relation
  driverParameter?: DriverModuleParameterDefinitionRow; // relation
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

    // scalar FK columns you will set directly
    definitionSystemId: {name: 'definition_system_id', type: 'integer'},

    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    // bind relation to the FK column via joinColumn
    definition: {
      type: 'many-to-one',
      target: 'DriverModuleDefinition',
      joinColumn: {
        name: 'definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT', // prevent deletion of definition if modules exist
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete modules
    },
    dkvs: {
      type: 'one-to-many',
      target: 'Dkv',
      inverseSide: 'driverModule',
    },
  },
  indices: [
    {
      name: 'ix_driver_modules_definition_file_system',
      columns: ['definitionSystemId', 'fileSystemId'],
    },
    {
      name: 'uq_driver_modules_definition_system_id_file_system_id',
      columns: ['definitionSystemId', 'fileSystemId'],
      unique: true,
    },
  ],
});

export const DkvSchema = (_blobConverter: BlobBytesConverter) =>
  new EntitySchema<DkvRow>({
    name: 'Dkv',
    tableName: 'dkv',
    columns: {
      ...BaseColumnSchemaPart,
      driverModuleSystemId: {name: 'driver_module_system_id', type: 'integer'},
    },
    relations: {
      driverModule: {
        type: 'many-to-one',
        target: 'DriverModule',
        inverseSide: 'dkvs',
        joinColumn: {
          name: 'driver_module_system_id',
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
      parameterSystemId: {name: 'parameter_system_id', type: 'integer'},
      dkvSystemId: {name: 'dkv_system_id', type: 'integer'},
      payload: {
        type: 'blob',
        nullable: true,
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      dkv: {
        type: 'many-to-one',
        target: 'Dkv',
        joinColumn: {name: 'dkv_system_id', referencedColumnName: 'systemId'},
        onDelete: 'CASCADE',
      },
      driverParameter: {
        type: 'many-to-one',
        target: 'DriverModuleParameterDefinition',
        joinColumn: {
          name: 'parameter_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'RESTRICT',
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
    dkvSystemId: {
      name: 'dkv_system_id',
      type: 'integer',
      primary: true,
    },
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
      inverseSide: 'values',
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
