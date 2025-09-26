import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {VcpmModuleParameterDefinitionRow} from './vcpm-module-parameter-definition.schema';

export interface VcpmModuleDefinitionRow extends EntityBaseRow {
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;

  // Relations
  parameters: VcpmModuleParameterDefinitionRow[];
}

export const VcpmModuleDefinitionSchema =
  new EntitySchema<VcpmModuleDefinitionRow>({
    name: 'VcpmModuleDefinition',
    tableName: 'vcpm_module_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      moduleDefinitionId: {
        type: 'integer',
        name: 'module_definition_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      groupName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'group_name',
      },
      fileSystemId: {
        type: 'integer',
        name: 'file_system_id',
      },
    },
    relations: {
      // file: {
      //   type: 'many-to-one',
      //   target: 'File',
      //   joinColumn: {
      //     name: 'file_system_id',
      //     referencedColumnName: 'fileSystemId'
      //   }
      // },

      parameters: {
        type: 'one-to-many',
        target: 'VcpmModuleParameterDefinition',
        inverseSide: 'vcpmModuleDefinition',
        cascade: ['insert', 'update'],
      },
    },
  });
