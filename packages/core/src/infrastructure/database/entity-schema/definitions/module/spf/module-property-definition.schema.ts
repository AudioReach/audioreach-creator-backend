import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {SpfModulePropertiesDataRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module-properties-data';
import {EntitySchema} from 'typeorm';

export interface ModulePropertyRow extends EntityBaseRow {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyCategoryTpe: string;
  propertyStructure: string; // JSON

  // Relations
  spfModulePropertiesData?: SpfModulePropertiesDataRow[];
}

export const PropertyCategorySchema = new EntitySchema<ModulePropertyRow>({
  name: 'ModuleProperty',
  tableName: 'module_property_definitions',
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
  relations: {
    spfModulePropertiesData: {
      type: 'one-to-many',
      target: 'SpfModulePropertiesData',
      inverseSide: 'propertyDefinition',
    },
  },
});
