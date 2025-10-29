import {BaseColumnSchemaPart, EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {DriverModuleDefinitionRow} from './driver-module-definition.schema.js';

export interface DriverModuleParameterDefinitionRow extends EntityBaseRow {
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
  driverModuleDefinition: DriverModuleDefinitionRow;
}

export const DriverModuleParameterDefinitionSchema =
  new EntitySchema<DriverModuleParameterDefinitionRow>({
    name: 'DriverModuleParameterDefinition',
    tableName: 'driver_module_parameter_definitions',
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
        type: 'blob',
        name: 'default_data',
      },
      driverModuleDefinitionSystemId: {
        type: 'integer',
        name: 'driver_module_definition_system_id',
        nullable: true,
      },
    },
    relations: {
      driverModuleDefinition: {
        type: 'many-to-one',
        target: 'DriverModuleDefinition',
        inverseSide: 'parameters',
        joinColumn: {
          name: 'driver_module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_driver_module_def_id',
        columns: ['driverModuleDefinitionSystemId'],
      },
    ],
  });
