import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from './spf-module-definition.schema';
import {ModuleAttributeRow} from './module-attribute.schema';

export interface SpfModuleParameterDefinitionRow extends EntityBaseRow {
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  //toolPolicy: ToolPolicy[];
  pidType: string;
  isPersistent: boolean;
  attributes?: ModuleAttributeRow[];
  paramStructure: string; // JSON
  defaultData: Uint8Array;
  isReadOnly: boolean;

  // Foreign key relation
  spfModuleDefinitionSystemId: number;

  //type orm relation
  spfModuleDefinition: SpfModuleDefinitionRow;
}

export const SpfModuleParameterDefinitionSchema =
  new EntitySchema<SpfModuleParameterDefinitionRow>({
    name: 'SpfModuleParameterDefinition',
    tableName: 'spf_module_parameter_definitions',
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
      pidType: {
        type: 'varchar',
        length: 100,
        name: 'pid_type',
      },
      isPersistent: {
        type: 'boolean',
        name: 'is_persistent',
      },
      paramStructure: {
        type: 'text',
        name: 'param_structure',
      },
      defaultData: {
        type: 'bytea', // or 'blob' depending on your database
        name: 'default_data',
      },
      isReadOnly: {
        type: 'boolean',
        name: 'is_read_only',
      },
      spfModuleDefinitionSystemId: {
        type: 'integer',
        name: 'spf_module_definition_system_id',
        nullable: true,
      },
    },
    relations: {
      spfModuleDefinition: {
        type: 'many-to-one',
        target: 'SpfModuleDefinition',
        inverseSide: 'parameters',
        joinColumn: {
          name: 'spf_module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_spf_module_def_id',
        columns: ['spf_module_definition_system_id'],
      },
    ],
  });
