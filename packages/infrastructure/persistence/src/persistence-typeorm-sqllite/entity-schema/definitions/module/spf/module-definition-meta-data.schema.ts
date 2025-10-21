import {BaseColumnSchemaPart, EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';

export interface ModuleDefinitionMetaDataRow extends EntityBaseRow {
  value?: string;

  // Foreign key relation
  moduleDefinitionSystemId: number;

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const ModuleDefinitionMetaDataSchema =
  new EntitySchema<ModuleDefinitionMetaDataRow>({
    name: 'ModuleDefinitionMetaData',
    tableName: 'module_definition_meta_data',
    columns: {
      ...BaseColumnSchemaPart,
      value: {
        type: 'text',
        nullable: true,
        name: 'value',
      },
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
      },
    },
    relations: {
      moduleDefinition: {
        type: 'one-to-one',
        target: 'SpfModuleDefinition',
        inverseSide: 'metaData',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_module_def_meta_module_def_id',
        columns: ['moduleDefinitionSystemId'],
      },
    ],
  });
