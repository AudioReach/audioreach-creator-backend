/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {ModuleDefinitionProcessorLinkRow} from '../module/spf/module-definition-processor-link.schema.js';

export interface ProcessorDefinitionRow extends EntityBaseRow {
  name: string;
  processorDefinitionId: number;
  moduleDefinitionLinks?: ModuleDefinitionProcessorLinkRow[];
}

export const ProcessorDefinitionSchema =
  new EntitySchema<ProcessorDefinitionRow>({
    name: 'ProcessorDefinition',
    tableName: 'processor_definitions',
    columns: {
      ...BaseColumnSchemaPart,
      processorDefinitionId: {
        type: 'integer',
        name: 'processor_definition_id',
      },
      name: {
        type: 'varchar',
        length: 255,
        name: 'name',
      },
    },
    relations: {
      moduleDefinitionLinks: {
        type: 'one-to-many',
        target: 'ModuleDefinitionProcessorLink',
        inverseSide: 'processorDefinition',
      },
    },
  });
