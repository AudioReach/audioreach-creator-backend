import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {DriverModuleParameterDefinitionRow} from './driver-module-parameter-definition.schema';

export interface DriverModuleDefinitionRow extends EntityBaseRow {
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;

  // Relations
  parameters: DriverModuleParameterDefinitionRow[];
}

export const DriverModuleDefinitionSchema =
  new EntitySchema<DriverModuleDefinitionRow>({
    name: 'DriverModuleDefinition',
    tableName: 'driver_module_definitions',
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
        target: 'DriverModuleParameterDefinition',
        inverseSide: 'driverModuleDefinition',
        cascade: ['insert', 'update'],
      },
    },
  });
