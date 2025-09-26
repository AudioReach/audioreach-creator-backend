import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from '../module/spf/spf-module-definition.schema';

export interface ProcessorDefinitionRow extends EntityBaseRow {
  name: string;
  processorDefinitionId: number;

  //relation
  moduleDefinitions: SpfModuleDefinitionRow[];
}

export const ProcessorDefinitionSchema =
  new EntitySchema<ProcessorDefinitionRow>({
    name: 'ProcessorDefinition',
    tableName: 'processor_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      processorDefinitionId: {
        type: 'integer',
        name: 'processor_definition_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        name: 'name',
      },
    },
    relations: {
      moduleDefinitions: {
        type: 'many-to-many',
        target: 'ModuleDefinition',
        inverseSide: 'processorDefinitions',
      },
    },
  });
