import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {ModuleDefinitionMetaDataRow} from './module-definition-meta-data.schema.js';
import type {DataPortGroupRow} from './data-group-definition.schema.js';
import type {ModuleAttributeRow} from './module-attribute.schema.js';
import type {StaticControlPortDefinitionRow} from './static-control-port-definition.schema.js';
import type {SpfModuleParameterDefinitionRow} from './spf-module-parameter-definition.schema.js';
import type {ProcessorDefinitionRow} from '../../common/processor-definition.schema.js';
import type {ContainerTypeRow} from '../../container/container-definition.schema.js';
import type {DynamicIntentDefinitionRow} from './dynamic-intent-definition.schema.js';
import type {SpfModuleRow} from '../../../usecase-data/module/spf-module.schema.js';

export interface SpfModuleDefinitionRow extends EntityBaseRow {
  moduleDefinitionId: number;
  name: string;
  displayName?: string;
  description?: string;
  groupName?: string;
  modSearchKeys?: string;
  stackSize: number;
  fileSystemId: number;

  // Relations
  metaData?: ModuleDefinitionMetaDataRow;
  dataPortGroups?: DataPortGroupRow[];
  staticPorts?: StaticControlPortDefinitionRow[];
  dynamicIntents?: DynamicIntentDefinitionRow[];
  parameters: SpfModuleParameterDefinitionRow[];
  attributes?: ModuleAttributeRow[];
  processorDefinitions: ProcessorDefinitionRow[];
  containerTypes: ContainerTypeRow[];
  modules?: SpfModuleRow[];
}

export const SpfModuleDefinitionSchema =
  new EntitySchema<SpfModuleDefinitionRow>({
    name: 'SpfModuleDefinition',
    tableName: 'spf_module_definitions',
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
      displayName: {
        type: 'varchar',
        length: 255,
        nullable: true,
        name: 'display_name',
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
      modSearchKeys: {
        type: 'text',
        nullable: true,
        name: 'mod_search_keys',
      },
      stackSize: {
        type: 'integer',
        default: 0,
        name: 'stack_size',
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
      metaData: {
        type: 'one-to-one',
        target: 'ModuleDefinitionMetaData',
        inverseSide: 'moduleDefinition',
        joinColumn: {
          name: 'module_definition_system_id',
          referencedColumnName: 'systemId',
        },
        cascade: ['insert', 'update'],
      },
      dataPortGroups: {
        type: 'one-to-many',
        target: 'DataPortGroup',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      staticPorts: {
        type: 'one-to-many',
        target: 'StaticControlPortDefinition',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      dynamicIntents: {
        type: 'one-to-many',
        target: 'DynamicIntentDefinition',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      parameters: {
        type: 'one-to-many',
        target: 'SpfModuleParameterDefinition',
        inverseSide: 'spfModuleDefinition',
        cascade: ['insert', 'update'],
      },
      attributes: {
        type: 'one-to-many',
        target: 'ModuleAttribute',
        inverseSide: 'moduleDefinition',
        cascade: ['insert', 'update'],
      },
      processorDefinitions: {
        type: 'many-to-many',
        target: 'ProcessorDefinition',
        inverseSide: 'moduleDefinitions',
        joinTable: {
          name: 'module_definition_processor_definitions',
          joinColumn: {
            name: 'module_definition_system_id',
            referencedColumnName: 'systemId',
          },
          inverseJoinColumn: {
            name: 'processor_definition_system_id',
            referencedColumnName: 'systemId',
          },
        },
      },
      containerTypes: {
        type: 'many-to-many',
        target: 'ContainerType',
        joinTable: {
          name: 'module_definition_container_types',
          joinColumn: {
            name: 'module_definition_system_id',
            referencedColumnName: 'systemId',
          },
          inverseJoinColumn: {
            name: 'container_type_system_id',
            referencedColumnName: 'systemId',
          },
        },
      },
      modules: {
        type: 'one-to-many',
        target: 'SpfModule',
        inverseSide: 'definition',
      },
    },
  });
