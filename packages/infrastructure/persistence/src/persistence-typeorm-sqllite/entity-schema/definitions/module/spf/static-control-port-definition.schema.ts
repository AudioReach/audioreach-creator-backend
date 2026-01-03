import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import type {StaticIntentDefinitionRow} from './static-intent-definition.schema.js';

export interface StaticControlPortDefinitionRow extends EntityBaseRow {
  portId: number;
  portName: string;
  //relation
  staticIntents: StaticIntentDefinitionRow[];

  // Foreign key relation
  moduleDefinitionSystemId: number;

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}
export const StaticControlPortDefinitionSchema =
  new EntitySchema<StaticControlPortDefinitionRow>({
    name: 'StaticControlPortDefinition',
    tableName: 'static_control_port_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      portId: {
        type: 'integer',
        name: 'port_id',
      },
      portName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'port_name',
      },
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
      },
    },
    relations: {
      staticIntents: {
        type: 'one-to-many',
        target: 'StaticIntentDefinition',
        inverseSide: 'staticControlPortDefinition',
        cascade: ['insert', 'update'],
      },
      moduleDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleDefinition',
        inverseSide: 'staticPorts',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_static_ports_module_def_id',
        columns: ['moduleDefinitionSystemId'],
      },
    ],
  });
