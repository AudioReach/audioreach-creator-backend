/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BaseColumnSchemaPart,
  type EntityBaseRow,
} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import type {ModuleAttributeRow} from './module-attribute.schema.js';
import type {CkvParameterPayloadRow} from '../../../usecase-data/module/spf-module-calibration-data.schema.js';
import type {TkvParameterPayloadRow} from '../../../usecase-data/module/spf-module-tag-data.schema.js';
export interface SpfModuleParameterDefinitionRow extends EntityBaseRow {
  paramId: number;
  name?: string;
  description?: string;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  attributes?: ModuleAttributeRow[];
  elementsStructure: string; // JSON
  isReadOnly: boolean;
  toolPolicies?: string;

  // Foreign key relation
  spfModuleDefinitionSystemId: number;

  //type orm relation
  spfModuleDefinition: SpfModuleDefinitionRow;
  ckvParameterPayloads?: CkvParameterPayloadRow[];
  tkvParameterPayloads?: TkvParameterPayloadRow[];
}

export const SpfModuleParameterDefinitionSchema =
  new EntitySchema<SpfModuleParameterDefinitionRow>({
    name: 'SpfModuleParameterDefinition',
    tableName: 'spf_module_parameter_definitions',
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
      elementsStructure: {
        type: 'text',
        name: 'elements_structure',
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
