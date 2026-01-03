import type {KeyDefinitionRow} from '../../definitions/key-value/key-definition.schema.js';
import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {NodeRow} from '../node/node.schema.js';

export interface SubsystemRow extends EntityBaseRow {
  filteredKeys: KeyDefinitionRow[];
  name: string;

  // one-to-one relation to Node
  node?: NodeRow;
}

export const SubsystemSchema = new EntitySchema<SubsystemRow>({
  name: 'Subsystem',
  tableName: 'subsystems',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
    },
  },
  relations: {
    filteredKeys: {
      type: 'many-to-many',
      target: 'KeyDefinition',
      // TypeORM will auto-generate join table: subsystem_filtered_keys_key_definition
    },
    node: {
      type: 'one-to-one',
      target: 'Node',
      joinColumn: {
        name: 'system_id', // Use the PK column itself
        referencedColumnName: 'systemId', // Reference Node's PK
      },
      onDelete: 'CASCADE', // If Node is deleted, delete Subsystem
    },
  },
});
