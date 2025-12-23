import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {ValueDefinitionRow} from './value-definition.schema.js';
import {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';

/*
	Aggregate entity for key-definition
*/
export interface KeyDefinitionRow extends EntityBaseRow {
  // primary key
  systemId: number;

  // foreign key to arc_db_file
  fileSystemId: number;

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

  // Relations
  file?: ArcDbFileRow;
  values: ValueDefinitionRow[];
}

export const KeyDefinitionSchema = new EntitySchema<KeyDefinitionRow>({
  name: 'KeyDefinition',
  tableName: 'arc_keys',
  columns: {
    ...BaseColumnSchemaPart,
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    keyId: {
      name: 'key_id',
      type: 'integer',
      unique: false,
    },
    keyName: {
      name: 'key_name',
      type: 'text',
      unique: false,
    },
    cEnumMemberName: {
      name: 'key_enum_name',
      type: 'text',
      nullable: true,
    },
    cEnumName: {
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
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    values: {
      type: 'one-to-many',
      target: 'ValueDefinition',
      inverseSide: 'keys',
      cascade: ['insert', 'update', 'remove'],
    },
  },
});
