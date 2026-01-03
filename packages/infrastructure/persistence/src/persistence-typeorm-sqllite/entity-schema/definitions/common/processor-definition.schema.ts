import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from '../module/spf/spf-module-definition.schema.js';

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
        target: 'SpfModuleDefinition',
        inverseSide: 'processorDefinitions',
      },
    },
  });
