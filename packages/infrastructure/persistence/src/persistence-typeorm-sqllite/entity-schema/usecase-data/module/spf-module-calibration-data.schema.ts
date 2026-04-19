/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {KeyVectorRow} from '../common/key-vector-schema.js';
import type {BlobBytesConverter} from './helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from './helper/bytes-transformer.js';
import type {SpfModuleRow} from './spf-module.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../definitions/module/spf/spf-module-parameter-definition.schema.js';
import {EntitySchema} from 'typeorm';

export interface CkvRow extends EntityBaseRow {
  spfModuleSystemId: number;
  keyVectorSystemId: number;
  uiPersistence: Uint8Array | null;

  module?: SpfModuleRow; // many- one
  keyVector?: KeyVectorRow; // many-one
  payloadCollection: CkvParameterPayloadRow[]; // one- many
}

export interface CkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array | null;

  ckvSystemId: number; // FK
  ckv?: CkvRow; // relation
  spfParameter?: SpfModuleParameterDefinitionRow; // relation
}

export const CkvSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<CkvRow>({
    name: 'Ckv',
    tableName: 'ckv',
    columns: {
      ...BaseColumnSchemaPart,
      spfModuleSystemId: {name: 'spf_module_system_id', type: 'integer'},
      keyVectorSystemId: {name: 'key_vector_system_id', type: 'integer'},
      uiPersistence: {
        name: 'ui_persistence',
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      module: {
        type: 'many-to-one',
        target: 'SpfModule',
        inverseSide: 'ckvs',
        joinColumn: {
          name: 'spf_module_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      keyVector: {
        type: 'many-to-one',
        target: 'KeyVector',
        joinColumn: {
          name: 'key_vector_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'RESTRICT',
      },
      payloadCollection: {
        type: 'one-to-many',
        target: 'CkvParameterPayload',
        inverseSide: 'ckv',
      },
    },
    indices: [
      {
        name: 'ix_ckv_module_keyvector',
        columns: ['spfModuleSystemId', 'keyVectorSystemId'],
        unique: true, // Unique KeyVector per module
      },
    ],
  });

export const CkvParameterPayloadRowSchema = (
  blobConverter: BlobBytesConverter,
) =>
  new EntitySchema<CkvParameterPayloadRow>({
    name: 'CkvParameterPayload',
    tableName: 'ckv_parameter_payload',
    columns: {
      ...BaseColumnSchemaPart,
      parameterSystemId: {name: 'parameter_system_id', type: 'integer'},
      ckvSystemId: {name: 'ckv_system_id', type: 'integer'},
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      ckv: {
        type: 'many-to-one',
        target: 'Ckv',
        joinColumn: {name: 'ckv_system_id', referencedColumnName: 'systemId'},
        onDelete: 'CASCADE',
      },
      spfParameter: {
        type: 'many-to-one',
        target: 'SpfModuleParameterDefinition',
        joinColumn: {
          name: 'parameter_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'ix_ckv_parameter',
        columns: ['ckvSystemId', 'parameterSystemId'],
        unique: true,
      },
    ],
  });
