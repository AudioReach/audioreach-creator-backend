/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart} from '../entity-base.js';
import type {EntityBaseRow} from '../entity-base.js';
import type {ArcDbFileRow} from './arc-db-file.schema.js';
import {MODULE_PORT_STRATEGIES, type ModulePortStrategy} from '@arc/core';

export interface ConfigurationRow extends EntityBaseRow {
  fileSystemId: number;
  portStrategy: ModulePortStrategy;
  extraConfig: string | null;

  file?: ArcDbFileRow;
}

export const ConfigurationSchema = new EntitySchema<ConfigurationRow>({
  name: 'Configuration',
  tableName: 'configuration',
  columns: {
    ...BaseColumnSchemaPart,
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
    portStrategy: {
      name: 'port_strategy',
      type: 'simple-enum',
      enum: Object.values(MODULE_PORT_STRATEGIES),
      nullable: false,
    },
    extraConfig: {
      name: 'extra_config',
      type: 'text',
      nullable: true,
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'uk_configuration_file',
      columns: ['fileSystemId'],
      unique: true,
    },
  ],
});
