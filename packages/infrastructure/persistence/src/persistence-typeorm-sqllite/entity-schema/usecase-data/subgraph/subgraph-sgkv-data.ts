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

/** SGKV-to-value relationship scalars keyed by a synthetic system ID. */
export interface SgkvValuesBase {
  systemId: number;
  sgkvSystemId: number;
  valueDefSystemId: number;
}

export interface SgkvValuesRow extends EntityBaseRow, SgkvValuesBase {
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
    ...BaseColumnSchemaPart,
    sgkvSystemId: {name: 'sgkv_system_id', type: 'integer'},
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
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
  indices: [
    {
      name: 'uq_sgkv_values_sgkv_value_definition',
      columns: ['sgkvSystemId', 'valueDefSystemId'],
      unique: true,
    },
  ],
});
