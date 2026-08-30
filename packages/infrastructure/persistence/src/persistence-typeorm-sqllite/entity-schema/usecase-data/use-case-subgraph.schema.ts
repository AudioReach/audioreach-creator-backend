/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import type {UseCaseRow} from './use-case.js';
import type {SubgraphRow} from './subgraph/subgraph.schema.js';

export interface UseCaseSubgraphBase {
  systemId: number;
  usecaseSystemId: number;
  subgraphSystemId: number;
}

export interface UseCaseSubgraphRow extends EntityBaseRow, UseCaseSubgraphBase {
  useCase?: UseCaseRow;
  subgraph?: SubgraphRow;
}

export const UseCaseSubgraphSchema = new EntitySchema<UseCaseSubgraphRow>({
  name: 'UseCaseSubgraph',
  tableName: 'use_case_subgraphs',
  columns: {
    ...BaseColumnSchemaPart,
    usecaseSystemId: {
      name: 'usecase_system_id',
      type: 'integer',
    },
    subgraphSystemId: {
      name: 'subgraph_system_id',
      type: 'integer',
    },
  },
  relations: {
    useCase: {
      type: 'many-to-one',
      target: 'UseCase',
      joinColumn: {name: 'usecase_system_id', referencedColumnName: 'systemId'},
      inverseSide: 'subgraphMemberships',
      onDelete: 'CASCADE',
    },
    subgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'subgraph_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'uq_use_case_subgraphs_membership',
      columns: ['usecaseSystemId', 'subgraphSystemId'],
      unique: true,
    },
    {
      name: 'idx_use_case_subgraphs_subgraph',
      columns: ['subgraphSystemId'],
    },
  ],
});
