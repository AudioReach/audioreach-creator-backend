import type {ModulePropertyRow} from '../../definitions/module/spf/module-property-definition.schema.js';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {SpfModuleRow} from './spf-module.schema.js';
import type {BlobBytesConverter} from './helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from './helper/bytes-transformer.js';
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
        target: 'ModulePropertyDefinition',
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
