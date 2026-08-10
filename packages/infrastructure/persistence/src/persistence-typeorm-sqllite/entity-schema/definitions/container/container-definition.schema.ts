/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';
import type {ModuleDefinitionContainerTypeLinkRow} from '../module/spf/module-definition-container-type-link.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ContainerTypeBase {
  systemId: number;
  name: string;
  value: number;
}

export interface ContainerTypeRow extends EntityBaseRow, ContainerTypeBase {
  moduleDefinitionLinks?: ModuleDefinitionContainerTypeLinkRow[];
}

export const ContainerTypeSchema = new EntitySchema<ContainerTypeRow>({
  name: 'ContainerType',
  tableName: 'container_types',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      name: 'name',
    },
    value: {
      type: 'integer',
      name: 'value',
    },
  },
  relations: {
    moduleDefinitionLinks: {
      type: 'one-to-many',
      target: 'ModuleDefinitionContainerTypeLink',
      inverseSide: 'containerType',
    },
  },
});
