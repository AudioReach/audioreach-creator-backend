import {BaseColumnSchemaPart, EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {StaticControlPortDefinitionRow} from './static-control-port-definition.schema.js';

export interface StaticIntentDefinitionRow extends EntityBaseRow {
  intentId: number;
  name: string;
  maxPort: number;

  // Foreign key relation
  staticControlPortDefinitionSystemId: number;

  //type orm relation
  staticControlPortDefinition: StaticControlPortDefinitionRow;
}

export const StaticIntentDefinitionSchema =
  new EntitySchema<StaticIntentDefinitionRow>({
    name: 'StaticIntentDefinition',
    tableName: 'static_intent_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      intentId: {
        type: 'integer',
        name: 'intent_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      maxPort: {
        type: 'integer',
        length: 255,
        nullable: true,
        name: 'max_port',
      },
      staticControlPortDefinitionSystemId: {
        type: 'integer',
        name: 'static_control_port_defition_system_id',
      },
    },
    relations: {
      staticControlPortDefinition: {
        type: 'many-to-one',
        target: 'StaticControlPortDefinition',
        inverseSide: 'staticIntents',
        joinColumn: {
          name: 'static_control_port_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_static_intent_defs_port_id',
        columns: ['static_control_port_definition_system_id'],
      },
    ],
  });
