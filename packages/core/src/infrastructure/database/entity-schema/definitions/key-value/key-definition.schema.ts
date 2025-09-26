import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ValueDefinitionRow} from './value-definition.schema';
import {EntitySchema} from 'typeorm';

/*
	Aggregate entity for key-definition
*/
export interface KeyDefinitionRow extends EntityBaseRow {
  // primary key
  systemId: number;

  // member of key entity
  keyId: number;
  keyName: string;

  // used for generating C header files
  cEnumMemberName?: string;
  cEnumName?: string;
  description?: string;

  // base entity
  creationDate: Date;
  updateDate: Date;

  // values belonging this key
  values: ValueDefinitionRow[];
}

export const keyEntitySchema = new EntitySchema<KeyDefinitionRow>({
  name: 'KeyDefinition',
  tableName: 'arc_keys',
  columns: {
    ...BaseColumnSchemaPart,
    keyId: {
      name: 'key_id',
      type: Number,
      unique: true,
      unsigned: true,
    },
    keyName: {
      name: 'key_name',
      type: String,
      unique: true,
    },
    cEnumMemberName: {
      name: 'key_enum_name',
      type: String,
      nullable: true,
    },
    cEnumName: {
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
    values: {
      type: 'one-to-many',
      target: 'ValueDefinition',
      inverseSide: 'schemaRelationKeys',
      cascade: ['insert', 'update', 'remove'],
    },
  },
});
