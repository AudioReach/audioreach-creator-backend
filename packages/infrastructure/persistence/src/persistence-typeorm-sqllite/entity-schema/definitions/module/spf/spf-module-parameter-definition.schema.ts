import {BaseColumnSchemaPart, EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import {ModuleAttributeRow} from './module-attribute.schema.js';
import {CkvParameterPayloadRow} from '../../../usecase-data/module/spf-module-calibration-data.schema.js';
import {TkvParameterPayloadRow} from '../../../usecase-data/module/spf-module-tag-data.schema.js';
import {BlobBytesConverter} from '../../../usecase-data/module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../../../usecase-data/module/helper/bytes-transformer.js';

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
  ckvParameterPayloads?: CkvParameterPayloadRow[];
  tkvParameterPayloads?: TkvParameterPayloadRow[];
}

export const SpfModuleParameterDefinitionSchema = (
  blobConverter: BlobBytesConverter,
) =>
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
        type: 'blob', // or 'blob' depending on your database
        name: 'default_data',
        transformer: DbTypeToBytesTransformer(blobConverter),
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
      ckvParameterPayloads: {
        type: 'one-to-many',
        target: 'CkvParameterPayload',
        inverseSide: 'spfParameter',
      },
      tkvParameterPayloads: {
        type: 'one-to-many',
        target: 'TkvParameterPayload',
        inverseSide: 'spfParameter',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_spf_module_def_id',
        columns: ['spfModuleDefinitionSystemId'],
      },
    ],
  });
