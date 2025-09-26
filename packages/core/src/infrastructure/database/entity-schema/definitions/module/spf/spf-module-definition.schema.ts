import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {EntitySchema} from 'typeorm';
import {ModuleDefinitionMetaDataRow} from './module-definition-meta-data.schema';
import {DataPortGroupRow} from './data-group-definition.schema';
import {ModuleAttributeRow} from './module-attribute.schema';
import {StaticControlPortDefinitionRow} from './static-control-port-definition.schema';
import {SpfModuleParameterDefinitionRow} from './spf-module-parameter-definition.schema';
import {ProcessorDefinitionRow} from '../../common/processor-definition.schema';
import {ContainerTypeRow} from '../../container/container-definition.schema';
import {DynamicIntentDefinitionRow} from './dynamic-intent-definition.schema';
import {SpfModuleRow} from '../../../usecase-data/module/spf-module.schema';

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
        target: 'IntentDefinition',
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
