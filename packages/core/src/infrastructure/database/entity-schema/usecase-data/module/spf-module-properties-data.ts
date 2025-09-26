import {ModulePropertyRow} from '@infrastructure/database/entity-schema/definitions/module/spf/module-property-definition.schema';
import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {SpfModuleRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module.schema';
import {BlobBytesConverter} from '@infrastructure/database/entity-schema/usecase-data/module/helper/blob-unit8array.converter';
import {DbTypeToBytesTransformer} from '@infrastructure/database/entity-schema/usecase-data/module/helper/bytes-transformer';
import {EntitySchema} from 'typeorm';

export interface SpfModulePropertiesDataRow extends EntityBaseRow {
  moduleSystemId: number;
  propertySystemId: number;
  payload: Uint8Array;

  module?: SpfModuleRow;
  propertyDefinition: ModulePropertyRow;
}

export const SpfModulePropertiesDataSchema = (
  blobConverter: BlobBytesConverter,
) =>
  new EntitySchema<SpfModulePropertiesDataRow>({
    name: 'SpfModulePropertiesData',
    tableName: 'spf_module_properties_data',
    columns: {
      ...BaseColumnSchemaPart,
      moduleSystemId: {
        name: 'module_system_id',
        type: 'integer',
      },
      propertySystemId: {
        name: 'property_system_id',
        type: 'integer',
      },
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      module: {
        type: 'many-to-one',
        target: 'SpfModule',
        joinColumn: {
          name: 'module_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      propertyDefinition: {
        type: 'many-to-one',
        target: 'ModuleProperty',
        joinColumn: {
          name: 'property_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uk_spf_module_properties_data',
        columns: ['moduleSystemId', 'propertySystemId'],
        unique: true,
      },
    ],
  });
