/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {SpfModuleDefinitionRow} from '../module/spf/spf-module-definition.schema.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ProcessorDefinitionBase {
  systemId: number;
  processorDefinitionId: number;
  name: string;
  fileSystemId: number;
}

export interface ProcessorDefinitionRow
  extends EntityBaseRow, ProcessorDefinitionBase {
  moduleDefinitions?: SpfModuleDefinitionRow[];
  file?: ArcDbFileRow;
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
      fileSystemId: {
        type: 'integer',
        name: 'file_system_id',
      },
    },
    relations: {
      moduleDefinitions: {
        type: 'one-to-many',
        target: 'SpfModuleDefinition',
        inverseSide: 'processor',
      },
      file: {
        type: 'many-to-one',
        target: 'ArcDbFile',
        joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
        onDelete: 'CASCADE',
      },
    },
  });
