/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {SubgraphRow} from './subgraph.schema.js';
import type {ValueDefinitionRow} from '../../definitions/key-value/value-definition.schema.js';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface SgkvBase {
  systemId: number;
  subgraphSystemId: number;
}

export interface SgkvRow extends EntityBaseRow, SgkvBase {
  subgraph?: SubgraphRow;
  values?: SgkvValuesRow[];
}

export interface SgkvValuesRow {
  sgkvSystemId: number;
  valueDefSystemId: number;
  sgkv?: SgkvRow;
  valueDef?: ValueDefinitionRow;
}

export const SgkvSchema = new EntitySchema<SgkvRow>({
  name: 'Sgkv',
  tableName: 'sgkv',
  columns: {
    ...BaseColumnSchemaPart,
    subgraphSystemId: {name: 'subgraph_system_id', type: 'integer'},
  },
  relations: {
    subgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'subgraph_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    values: {
      type: 'one-to-many',
      target: 'SgkvValues',
      inverseSide: 'sgkv',
    },
  },
});

export const SgkvValuesSchema = new EntitySchema<SgkvValuesRow>({
  name: 'SgkvValues',
  tableName: 'sgkv_values',
  columns: {
    sgkvSystemId: {name: 'sgkv_system_id', type: 'integer', primary: true},
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
      primary: true,
    },
  },
  relations: {
    sgkv: {
      type: 'many-to-one',
      target: 'Sgkv',
      joinColumn: {name: 'sgkv_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
    valueDef: {
      type: 'many-to-one',
      target: 'ValueDefinition',
      joinColumn: {
        name: 'value_def_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
  },
});
