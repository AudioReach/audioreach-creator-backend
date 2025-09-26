import {KeyDefinitionRow} from '@infrastructure/database/entity-schema/definitions/key-value/key-definition.schema';
import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';

export interface SubsystemRow extends EntityBaseRow {
  filteredKeys: KeyDefinitionRow[];
  name: string;
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
  },
});
