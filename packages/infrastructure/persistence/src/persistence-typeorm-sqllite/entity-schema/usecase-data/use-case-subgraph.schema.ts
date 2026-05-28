/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {UseCaseRow} from './use-case.js';
import type {SubgraphRow} from './subgraph/subgraph.schema.js';

export interface UseCaseSubgraphRow {
  usecaseSystemId: number;
  subgraphSystemId: number;

  useCase?: UseCaseRow;
  subgraph?: SubgraphRow;
}

export const UseCaseSubgraphSchema = new EntitySchema<UseCaseSubgraphRow>({
  name: 'UseCaseSubgraph',
  tableName: 'use_case_subgraphs',
  columns: {
    usecaseSystemId: {
      name: 'usecase_system_id',
      type: 'integer',
      primary: true,
    },
    subgraphSystemId: {
      name: 'subgraph_system_id',
      type: 'integer',
      primary: true,
    },
  },
  relations: {
    useCase: {
      type: 'many-to-one',
      target: 'UseCase',
      joinColumn: {name: 'usecase_system_id', referencedColumnName: 'systemId'},
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
      name: 'idx_use_case_subgraphs_subgraph',
      columns: ['subgraphSystemId'],
    },
  ],
});
