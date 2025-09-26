import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {KeyVectorRow} from '@infrastructure/database/entity-schema/usecase-data/common/key-vector-schema';
import {BlobBytesConverter} from '@infrastructure/database/entity-schema/usecase-data/module/helper/blob-unit8array.converter';
import {DbTypeToBytesTransformer} from '@infrastructure/database/entity-schema/usecase-data/module/helper/bytes-transformer';
import {SpfModuleRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module.schema';
import {SpfModuleParameterDefinitionRow} from '@infrastructure/database/entity-schema/definitions/module/spf/spf-module-parameter-definition.schema';
import {EntitySchema} from 'typeorm';

export interface CkvRow extends EntityBaseRow {
  spfModuleSystemId: number;
  keyVectorSystemId: number;
  uiPersistence: Uint8Array;

  module?: SpfModuleRow; // many- one
  keyVector?: KeyVectorRow; // many-one
  payloadCollection: CkvParameterPayloadRow[]; // one- many
}

export interface CkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array;

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
