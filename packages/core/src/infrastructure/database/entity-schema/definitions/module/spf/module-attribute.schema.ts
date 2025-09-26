import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from './spf-module-definition.schema';

export interface ModuleAttributeRow extends EntityBaseRow {
  name: string;
  value: string;

  // Foreign key relation
  moduleDefinitionSystemId: number;

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const ModuleAttributeSchema = new EntitySchema<ModuleAttributeRow>({
  name: 'ModuleAttribute',
  tableName: 'module_attributes',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      name: 'name',
    },
    value: {
      type: 'varchar',
      length: 500,
      name: 'value',
    },
    moduleDefinitionSystemId: {
      type: 'integer',
      name: 'module_definition_system_id',
    },
  },
  relations: {
    moduleDefinition: {
      type: 'many-to-one',
      target: 'ModuleDefinition',
      inverseSide: 'attributes',
      joinColumn: {
        name: 'module_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'idx_module_attributes_module_def_id',
      columns: ['module_definition_system_id'],
    },
  ],
});
