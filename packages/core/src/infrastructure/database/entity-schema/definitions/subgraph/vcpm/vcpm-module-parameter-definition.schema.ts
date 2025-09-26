import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {VcpmModuleDefinitionRow} from './vcpm-module-definition.schema';

export interface VcpmModuleParameterDefinitionRow extends EntityBaseRow {
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  //toolPolicy: ToolPolicy[];
  paramStructure: string; // JSON
  defaultData: Uint8Array;

  // Foreign key relation
  driverModuleDefinitionSystemId: number;

  //type orm relation
  vcpmModuleDefinition: VcpmModuleDefinitionRow;
}

export const VcpmModuleParameterDefinitionSchema =
  new EntitySchema<VcpmModuleParameterDefinitionRow>({
    name: 'VcpmModuleParameterDefinition',
    tableName: 'vcpm_module_parameter_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      parameterId: {
        type: 'integer',
        name: 'parameter_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'name',
      },
      description: {
        type: 'text',
        nullable: true,
        name: 'description',
      },
      maxSize: {
        type: 'integer',
        name: 'max_size',
      },
      paramStructure: {
        type: 'text',
        name: 'param_structure',
      },
      defaultData: {
        type: 'bytea', // or 'blob' depending on your database
        name: 'default_data',
      },
      driverModuleDefinitionSystemId: {
        type: 'integer',
        name: 'driver_module_definition_system_id',
        nullable: true,
      },
    },
    relations: {
      vcpmModuleDefinition: {
        type: 'many-to-one',
        target: 'VcpmModuleDefinition',
        inverseSide: 'parameters',
        joinColumn: {
          name: 'vcpm_module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_vcpm_module_def_id',
        columns: ['vcpm_module_definition_system_id'],
      },
    ],
  });
