/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import type {UseCaseRow} from './use-case.js';
import type {SubgraphRow} from './subgraph/subgraph.schema.js';

export interface UseCaseSubgraphPairBase {
  systemId: number;
  usecaseSystemId: number;
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
}

export interface UseCaseSubgraphPairRow
  extends EntityBaseRow, UseCaseSubgraphPairBase {
  useCase?: UseCaseRow;
  sourceSubgraph?: SubgraphRow;
  destSubgraph?: SubgraphRow;
}

export const UseCaseSubgraphPairSchema =
  new EntitySchema<UseCaseSubgraphPairRow>({
    name: 'UseCaseSubgraphPair',
    tableName: 'use_case_subgraph_pairs',
    columns: {
      ...BaseColumnSchemaPart,
      usecaseSystemId: {
        name: 'usecase_system_id',
        type: 'integer',
      },
      sourceSubgraphSystemId: {
        name: 'source_subgraph_system_id',
        type: 'integer',
      },
      destSubgraphSystemId: {
        name: 'dest_subgraph_system_id',
        type: 'integer',
      },
    },
    relations: {
      useCase: {
        type: 'many-to-one',
        target: 'UseCase',
        joinColumn: {
          name: 'usecase_system_id',
          referencedColumnName: 'systemId',
        },
        inverseSide: 'subgraphPairs',
        onDelete: 'CASCADE',
      },
      sourceSubgraph: {
        type: 'many-to-one',
        target: 'Subgraph',
        joinColumn: {
          name: 'source_subgraph_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      destSubgraph: {
        type: 'many-to-one',
        target: 'Subgraph',
        joinColumn: {
          name: 'dest_subgraph_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uq_use_case_subgraph_pairs_membership',
        columns: [
          'usecaseSystemId',
          'sourceSubgraphSystemId',
          'destSubgraphSystemId',
        ],
        unique: true,
      },
      {
        name: 'idx_use_case_subgraph_pairs_sgs',
        columns: ['sourceSubgraphSystemId', 'destSubgraphSystemId'],
      },
    ],
  });
