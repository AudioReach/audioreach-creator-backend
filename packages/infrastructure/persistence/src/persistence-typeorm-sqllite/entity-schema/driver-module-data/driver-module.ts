import {DriverModuleDefinitionRow} from '../definitions/module/driver/driver-module-definition.schema.js';
import {DriverModuleParameterDefinitionRow} from '../definitions/module/driver/driver-module-parameter-definition.schema.js';
import {BaseColumnSchemaPart, EntityBaseRow} from '../entity-base.js';
import {KeyVectorRow} from '../usecase-data/common/key-vector-schema.js';
import {BlobBytesConverter} from '../usecase-data/module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../usecase-data/module/helper/bytes-transformer.js';
import {EntitySchema} from 'typeorm';

export interface DriverModuleRow extends EntityBaseRow {
  definitionSystemId: number;
  definition: DriverModuleDefinitionRow;
}

export interface DkvRow extends EntityBaseRow {
  moduleInstanceId: number;
  keyVectorSystemId: number;

  driverModule: DriverModuleRow;
  keyVector: KeyVectorRow;
  payloadCollection: DkvParameterPayloadRow[];
}

export interface DkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array;

  dkvSystemId: number; // FK
  dkv?: DkvRow; // relation
  driverParameter?: DriverModuleParameterDefinitionRow;
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
      onDelete: 'RESTRICT', // prevent deletion of definition if modules exist
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
    moduleInstanceId: {
      name: 'module_instance_id',
      type: 'integer',
    },
    keyVectorSystemId: {
      name: 'key_vector_system_id',
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
      target: 'DkvParameterPayload',
      inverseSide: 'dkv',
    },
  },
  indices: [
    {
      name: 'uk_dkv_module_keyvector',
      columns: ['moduleInstanceId', 'keyVectorSystemId'],
      unique: true,
    },
  ],
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
