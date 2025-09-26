import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';

export interface ContainerPropertyRow extends EntityBaseRow {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyStructure: string; // JSON

  // Relations
}

export const PropertyCategorySchema = new EntitySchema<ContainerPropertyRow>({
  name: 'ContainerProperty',
  tableName: 'container_property_definitions',
  columns: {
    ...BaseColumnSchemaPart,
    propertyId: {
      type: 'integer',
      name: 'property_id',
    },
    name: {
      type: 'varchar',
      length: 255,
      nullable: true,
      name: 'name',
    },
    description: {
      type: 'text',
      nullable: true,
      name: 'description',
    },
    maxSize: {
      type: 'integer',
      name: 'max_size',
    },
    propertyStructure: {
      type: 'text',
      name: 'property_structure',
    },
  },
});
