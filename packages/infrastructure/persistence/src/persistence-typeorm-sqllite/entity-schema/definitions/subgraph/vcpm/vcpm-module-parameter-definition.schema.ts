import {BaseColumnSchemaPart, EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {VcpmModuleDefinitionRow} from './vcpm-module-definition.schema.js';
import {VcpmParameterPayloadRow} from '../../../usecase-data/subgraph/subgraph-vcpm-data.js';
import {BlobBytesConverter} from '../../../usecase-data/module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../../../usecase-data/module/helper/bytes-transformer.js';

export interface VcpmModuleParameterDefinitionRow extends EntityBaseRow {
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  //toolPolicy: ToolPolicy[];
  paramStructure: string; // JSON
  defaultData: Uint8Array;

  // Foreign key relation
  vcpmModuleDefinitionSystemId: number;

  //type orm relation
  vcpmModuleDefinition: VcpmModuleDefinitionRow;
  vcpmParameterPayloads?: VcpmParameterPayloadRow[];
}

export const VcpmModuleParameterDefinitionSchema = (
  blobConverter: BlobBytesConverter,
) =>
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
        type: 'blob', // or 'blob' depending on your database
        name: 'default_data',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
      vcpmModuleDefinitionSystemId: {
        type: 'integer',
        name: 'vcpm_module_definition_system_id',
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
      vcpmParameterPayloads: {
        type: 'one-to-many',
        target: 'VcpmParameterPayload',
        inverseSide: 'vcpmParameter',
      },
    },
    indices: [
      {
        name: 'idx_module_param_defs_vcpm_module_def_id',
        columns: ['vcpmModuleDefinitionSystemId'],
      },
    ],
  });
