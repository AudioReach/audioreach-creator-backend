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

export interface ModuleTagIdMapRow extends EntityBaseRow {
  spfModuleSystemId: number;
  tagDefinitionSystemId: number;

  module?: SpfModuleRow; // many- one
  // To Do Add tag definition relation here
  tkvs?: TkvRow[]; // one-many
}

export interface TkvRow extends EntityBaseRow {
  moduleTagIdMapSystemId: number; // Fk to ModuleTagIdMapRow
  keyVectorSystemId: number;
  uiPersistence: Uint8Array;

  keyVector?: KeyVectorRow; // many-one
  moduleTagIdMapRow?: ModuleTagIdMapRow; // many-one to ModuleTagIdMapRow table
  payloadCollection: TkvParameterPayloadRow[]; // one-many
}

export interface TkvParameterPayloadRow extends EntityBaseRow {
  parameterSystemId: number;
  payload: Uint8Array;

  tkvSystemId: number; // FK
  tkv?: TkvRow; // relation
  spfParameter?: SpfModuleParameterDefinitionRow; // relation
}

export const ModuleTagIdMapSchema = new EntitySchema<ModuleTagIdMapRow>({
  name: 'ModuleTagIdMap',
  tableName: 'module_tag_id_map',
  columns: {
    ...BaseColumnSchemaPart,
    spfModuleSystemId: {name: 'spf_module_system_id', type: 'integer'},
    tagDefinitionSystemId: {name: 'tag_definition_system_id', type: 'integer'},
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
    tkvs: {
      type: 'one-to-many',
      target: 'Tkv',
      inverseSide: 'moduleTagIdMapRow',
    },
  },
  indices: [
    {
      name: 'ix_module_tag_definition',
      columns: ['spfModuleSystemId', 'tagDefinitionSystemId'],
      unique: true,
    },
  ],
});

export const TkvSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<TkvRow>({
    name: 'Tkv',
    tableName: 'tkv',
    columns: {
      ...BaseColumnSchemaPart,
      moduleTagIdMapSystemId: {
        name: 'module_tag_id_map_system_id',
        type: 'integer',
      },
      keyVectorSystemId: {name: 'key_vector_system_id', type: 'integer'},
      uiPersistence: {
        name: 'ui_persistence',
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      keyVector: {
        type: 'many-to-one',
        target: 'KeyVector',
        joinColumn: {
          name: 'key_vector_system_id',
          referencedColumnName: 'systemId',
        },
      },
      moduleTagIdMapRow: {
        type: 'many-to-one',
        target: 'ModuleTagIdMap',
        joinColumn: {
          name: 'module_tag_id_map_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      payloadCollection: {
        type: 'one-to-many',
        target: 'TkvParameterPayload',
        inverseSide: 'tkv',
      },
    },
    indices: [
      {
        name: 'ix_tkv_module_tag_keyvector',
        columns: ['moduleTagIdMapSystemId', 'keyVectorSystemId'],
        unique: true,
      },
    ],
  });

export const TkvParameterPayloadSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<TkvParameterPayloadRow>({
    name: 'TkvParameterPayload',
    tableName: 'tkv_parameter_payload',
    columns: {
      ...BaseColumnSchemaPart,
      parameterSystemId: {name: 'parameter_system_id', type: 'integer'},
      tkvSystemId: {name: 'tkv_system_id', type: 'integer'},
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      tkv: {
        type: 'many-to-one',
        target: 'Tkv',
        joinColumn: {name: 'tkv_system_id', referencedColumnName: 'systemId'},
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
        name: 'ix_tkv_parameter',
        columns: ['tkvSystemId', 'parameterSystemId'],
        unique: true,
      },
    ],
  });
