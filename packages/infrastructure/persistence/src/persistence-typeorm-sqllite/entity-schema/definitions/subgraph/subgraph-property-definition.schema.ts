import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';

export interface SubgraphPropertyRow extends EntityBaseRow {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyCategoryTpe: string;
  propertyStructure: string; // JSON

  // Relations
}

export const SubgraphPropertyDefinitionSchema =
  new EntitySchema<SubgraphPropertyRow>({
    name: 'SubgraphProperty',
    tableName: 'subgraph_property_definitions',
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
      propertyCategoryTpe: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'property_category_type',
      },
      propertyStructure: {
        type: 'text',
        name: 'property_structure',
      },
    },
  });
