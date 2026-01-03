import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import type {KeyDefinitionRow} from './key-definition.schema.js';
import type {KeyVectorRow} from '../../usecase-data/common/key-vector-schema.js';
import {EntitySchema} from 'typeorm';

/*
	Aggregate entity for key vectors, updates to parent entity should also update child entity
*/
export interface ValueDefinitionRow extends EntityBaseRow {
  // primary key(s)
  systemId: number;

  // foregin key(s)
  keySystemId: number;

  // member of value entity
  valueId: number;
  valueName: string;
  description?: string;

  // name used for c header file creation
  cEnumMemberName?: string;

  // base entity
  creationDate: Date;
  updateDate: Date;

  // type orm relation
  keys: KeyDefinitionRow;
  keyVectors?: KeyVectorRow[];
}

export const ValueDefinitionSchema = new EntitySchema<ValueDefinitionRow>({
  name: 'ValueDefinition',
  tableName: 'arc_values',
  columns: {
    ...BaseColumnSchemaPart,
    valueId: {
      name: 'value_id',
      type: 'integer',
      unique: false,
    },
    keySystemId: {
      name: 'keys_system_id',
      type: 'integer',
      nullable: false,
    },
    valueName: {
      name: 'value_name',
      type: 'text',
    },
    cEnumMemberName: {
      name: 'key_enum_value',
      type: 'text',
      nullable: true,
    },
    description: {
      type: 'text',
      nullable: true,
    },
  },
  relations: {
    keys: {
      type: 'many-to-one',
      target: 'KeyDefinition',
      inverseSide: 'values',
      joinColumn: {name: 'keys_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    keyVectors: {
      type: 'many-to-many',
      target: 'KeyVector',
      joinTable: {
        name: 'key_vector_values',
        joinColumn: {
          name: 'value_definition_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'key_vector_id',
          referencedColumnName: 'systemId',
        },
      },
      inverseSide: 'values',
    },
  },
  indices: [
    {
      name: 'idx_arc_values_keys_system_id',
      columns: ['keySystemId'],
    },
  ],
});
