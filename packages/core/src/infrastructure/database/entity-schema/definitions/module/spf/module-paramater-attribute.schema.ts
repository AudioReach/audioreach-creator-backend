import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {SpfModuleParameterDefinitionRow} from './spf-module-parameter-definition.schema';

export interface ModuleParameterAttributeRow extends EntityBaseRow {
  name: string;
  value: string;

  // Foreign key relation to ModuleParameterDefinition
  moduleParameterDefinitionSystemId: number;

  // TypeORM relation
  moduleParameterDefinition: SpfModuleParameterDefinitionRow;
}
export const ModuleParameterAttributeSchema =
  new EntitySchema<ModuleParameterAttributeRow>({
    name: 'ModuleParameterAttribute',
    tableName: 'module_parameter_attributes',
    columns: {
      ...BaseColumnSchemaPart,
      name: {
        type: 'varchar',
        length: 255,
        nullable: false,
        name: 'name',
      },
      value: {
        type: 'text',
        nullable: false,
        name: 'value',
      },
      moduleParameterDefinitionSystemId: {
        type: 'integer',
        name: 'module_parameter_definition_system_id',
      },
    },
    relations: {
      moduleParameterDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleParameterDefinition',
        inverseSide: 'parameterAttributes',
        joinColumn: {
          name: 'module_parameter_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
  });
