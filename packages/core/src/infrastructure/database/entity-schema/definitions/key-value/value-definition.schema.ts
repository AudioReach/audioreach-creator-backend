import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {KeyDefinitionRow} from './key-definition.schema';
import {UseCaseRow} from '@infrastructure/database/entity-schema/usecase-data/use-case';
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
  schemaRelationKeys: KeyDefinitionRow;
  useCases?: UseCaseRow[];
}

export const valueEntitySchema = new EntitySchema<ValueDefinitionRow>({
  name: 'ValueDefinition',
  tableName: 'arc_values',
  columns: {
    ...BaseColumnSchemaPart,
    valueId: {
      name: 'value_id',
      type: Number,
      unique: true,
      unsigned: true,
    },
    keySystemId: {
      name: 'keys_system_id',
      type: Number,
      nullable: false,
    },
    valueName: {
      name: 'value_name',
      type: String,
      unique: true,
    },
    cEnumMemberName: {
      name: 'key_enum_value',
      type: String,
      nullable: true,
    },
    description: {
      type: String,
      nullable: true,
    },
  },
  relations: {
    schemaRelationKeys: {
      type: 'many-to-one',
      target: 'KeyDefinition',
      inverseSide: 'values',
      joinColumn: {name: 'keys_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'values',
    },
  },
  indices: [
    {
      name: 'idx_arc_values_keys_system_id',
      columns: ['keys_system_id'],
    },
  ],
});
