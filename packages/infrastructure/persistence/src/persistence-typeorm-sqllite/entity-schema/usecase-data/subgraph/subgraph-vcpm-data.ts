/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VcpmModuleDefinitionRow} from '../../definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import type {VcpmModuleParameterDefinitionRow} from '../../definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {KeyVectorRow} from '../common/key-vector-schema.js';
import type {SubgraphRow} from './subgraph.schema.js';
import type {BlobBytesConverter} from '../module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../module/helper/bytes-transformer.js';
import {EntitySchema} from 'typeorm';

export interface VcpmInstanceRow extends EntityBaseRow {
  subgraphSystemId: number;
  vcpmDefinitionId: number;

  subgraph: SubgraphRow;
  vcpmDefinition: VcpmModuleDefinitionRow;
  vcpmCkvs?: VcpmCkvRow[];
}

export interface VcpmCkvRow extends EntityBaseRow {
  vcpmInstanceSystemId: number;
  keyVectorSystemId: number;

  vcpmInstance: VcpmInstanceRow; //many-one
  keyVector?: KeyVectorRow; // many-one
  vcpmParameterPayloads?: VcpmParameterPayloadRow[];
}

export interface VcpmParameterPayloadRow extends EntityBaseRow {
  payload: Uint8Array;

  vcpmParameterSystemId: number;
  vcpmParameter: VcpmModuleParameterDefinitionRow;

  vcpmCkvSystemId: number;
  vcpmCkv: VcpmCkvRow;
}

export const VcpmInstanceSchema = new EntitySchema<VcpmInstanceRow>({
  name: 'VcpmInstance',
  tableName: 'vcpm_instances',
  columns: {
    ...BaseColumnSchemaPart,
    subgraphSystemId: {
      name: 'subgraph_system_id',
      type: 'integer',
    },
    vcpmDefinitionId: {
      name: 'vcpm_definition_id',
      type: 'integer',
    },
  },
  relations: {
    subgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'subgraph_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    vcpmDefinition: {
      type: 'many-to-one',
      target: 'VcpmModuleDefinition',
      joinColumn: {
        name: 'vcpm_definition_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    vcpmCkvs: {
      type: 'one-to-many',
      target: 'VcpmCkv',
      inverseSide: 'vcpmInstance',
    },
  },
  indices: [
    {
      name: 'uk_vcpm_instance_subgraph_definition',
      columns: ['subgraphSystemId', 'vcpmDefinitionId'],
      unique: true,
    },
  ],
});

export const VcpmCkvSchema = new EntitySchema<VcpmCkvRow>({
  name: 'VcpmCkv',
  tableName: 'vcpm_ckv',
  columns: {
    ...BaseColumnSchemaPart,
    vcpmInstanceSystemId: {
      name: 'vcpm_instance_system_id',
      type: 'integer',
    },
    keyVectorSystemId: {
      name: 'key_vector_system_id',
      type: 'integer',
    },
  },
  relations: {
    vcpmInstance: {
      type: 'many-to-one',
      target: 'VcpmInstance',
      joinColumn: {
        name: 'vcpm_instance_system_id',
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
    vcpmParameterPayloads: {
      type: 'one-to-many',
      target: 'VcpmParameterPayload',
      inverseSide: 'vcpmCkv',
    },
  },
  indices: [
    {
      name: 'uk_vcpm_ckv_instance_keyvector',
      columns: ['vcpmInstanceSystemId', 'keyVectorSystemId'],
      unique: true,
    },
  ],
});

export const VcpmParameterPayloadSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<VcpmParameterPayloadRow>({
    name: 'VcpmParameterPayload',
    tableName: 'vcpm_parameter_payload',
    columns: {
      ...BaseColumnSchemaPart,
      vcpmParameterSystemId: {
        name: 'vcpm_parameter_system_id',
        type: 'integer',
      },
      vcpmCkvSystemId: {
        name: 'vcpm_ckv_system_id',
        type: 'integer',
      },
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      vcpmParameter: {
        type: 'many-to-one',
        target: 'VcpmModuleParameterDefinition',
        joinColumn: {
          name: 'vcpm_parameter_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      vcpmCkv: {
        type: 'many-to-one',
        target: 'VcpmCkv',
        joinColumn: {
          name: 'vcpm_ckv_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uk_vcpm_parameter_payload',
        columns: ['vcpmParameterSystemId', 'vcpmCkvSystemId'],
        unique: true,
      },
    ],
  });
