import {ContainerPropertyRow} from '@infrastructure/database/entity-schema/definitions/container/container-property-definition.schema';
import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ContainerRow} from '@infrastructure/database/entity-schema/usecase-data/container/container.schema';
import {BlobBytesConverter} from '@infrastructure/database/entity-schema/usecase-data/module/helper/blob-unit8array.converter';
import {DbTypeToBytesTransformer} from '@infrastructure/database/entity-schema/usecase-data/module/helper/bytes-transformer';
import {EntitySchema} from 'typeorm';

export interface ContainerPropertyDataRow extends EntityBaseRow {
  containerSystemId: number;
  propertySystemId: number;
  payload: Uint8Array;

  container: ContainerRow;
  containerProperty: ContainerPropertyRow;
}

export const ContainerPropertyDataSchema = (
  blobConverter: BlobBytesConverter,
) =>
  new EntitySchema<ContainerPropertyDataRow>({
    name: 'ContainerPropertyData',
    tableName: 'container_property_data',
    columns: {
      ...BaseColumnSchemaPart,
      containerSystemId: {
        name: 'container_system_id',
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
      container: {
        type: 'many-to-one',
        target: 'Container',
        joinColumn: {
          name: 'container_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      containerProperty: {
        type: 'many-to-one',
        target: 'ContainerProperty',
        joinColumn: {
          name: 'property_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uk_container_property_data',
        columns: ['containerSystemId', 'propertySystemId'],
        unique: true,
      },
    ],
  });
