/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {BlobBytesConverter} from './helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from './helper/bytes-transformer.js';
import type {SpfModuleRow} from './spf-module.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../definitions/module/spf/spf-module-parameter-definition.schema.js';
import type {ValueDefinitionRow} from '../../definitions/key-value/value-definition.schema.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface CkvBase {
  systemId: number;
  spfModuleSystemId: number;
  uiPersistence: Uint8Array | null;
}

export interface CkvRow extends EntityBaseRow, CkvBase {
  module?: SpfModuleRow; // many-one
  payloadCollection: CkvParameterPayloadRow[]; // one-many
  values?: CkvValuesRow[]; // one-many — the key-value combination that identifies this calibration bin
}

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface CkvParameterPayloadBase {
  systemId: number;
  parameterSystemId: number;
  payload: Uint8Array | null;
  ckvSystemId: number;
}

export interface CkvParameterPayloadRow
  extends EntityBaseRow, CkvParameterPayloadBase {
  ckv?: CkvRow; // relation
  spfParameter?: SpfModuleParameterDefinitionRow; // relation
}

/** Composite-PK join table scalars — no systemId, not overlaid. */
export interface CkvValuesBase {
  ckvSystemId: number;
  valueDefSystemId: number;
}

export interface CkvValuesRow extends CkvValuesBase {
  ckv?: CkvRow;
  valueDef?: ValueDefinitionRow;
}

export const CkvSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<CkvRow>({
    name: 'Ckv',
    tableName: 'ckv',
    columns: {
      ...BaseColumnSchemaPart,
      spfModuleSystemId: {name: 'spf_module_system_id', type: 'integer'},
      uiPersistence: {
        name: 'ui_persistence',
        type: 'blob',
        nullable: true,
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
      payloadCollection: {
        type: 'one-to-many',
        target: 'CkvParameterPayload',
        inverseSide: 'ckv',
      },
      values: {
        type: 'one-to-many',
        target: 'CkvValues',
        inverseSide: 'ckv',
      },
    },
    indices: [
      {
        name: 'idx_ckv_module_system_id',
        columns: ['spfModuleSystemId'],
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
      {
        name: 'idx_ckv_parameter_payload_ckv_system_id',
        columns: ['ckvSystemId'],
      },
    ],
  });

export const CkvValuesSchema = new EntitySchema<CkvValuesRow>({
  name: 'CkvValues',
  tableName: 'ckv_values',
  columns: {
    ckvSystemId: {name: 'ckv_system_id', type: 'integer', primary: true},
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
      primary: true,
    },
  },
  relations: {
    ckv: {
      type: 'many-to-one',
      target: 'Ckv',
      joinColumn: {name: 'ckv_system_id', referencedColumnName: 'systemId'},
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
