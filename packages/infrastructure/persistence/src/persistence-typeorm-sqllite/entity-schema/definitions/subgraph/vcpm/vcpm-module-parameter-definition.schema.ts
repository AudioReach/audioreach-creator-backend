/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {VcpmModuleDefinitionRow} from './vcpm-module-definition.schema.js';
import type {VcpmParameterPayloadRow} from '../../../usecase-data/subgraph/subgraph-vcpm-data.js';

export interface VcpmModuleParameterDefinitionRow extends EntityBaseRow {
  paramId: number;
  name?: string;
  description?: string;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  isReadOnly: boolean;
  toolPolicies?: string;
  elementsStructure: string; // JSON
  copySrcParamId?: number;

  // Foreign key relation
  vcpmModuleDefinitionSystemId: number;

  //type orm relation
  vcpmModuleDefinition: VcpmModuleDefinitionRow;
  vcpmParameterPayloads?: VcpmParameterPayloadRow[];
}

export const VcpmModuleParameterDefinitionSchema =
  new EntitySchema<VcpmModuleParameterDefinitionRow>({
    name: 'VcpmModuleParameterDefinition',
    tableName: 'vcpm_module_parameter_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      paramId: {
        type: 'integer',
        name: 'param_id',
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
      isReadOnly: {
        type: 'boolean',
        name: 'is_read_only',
      },
      toolPolicies: {
        type: 'text',
        nullable: true,
        name: 'tool_policies',
      },
      elementsStructure: {
        type: 'text',
        name: 'elements_structure',
        nullable: true,
      },
      copySrcParamId: {
        type: 'integer',
        nullable: true,
        name: 'copy_src_param_id',
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
