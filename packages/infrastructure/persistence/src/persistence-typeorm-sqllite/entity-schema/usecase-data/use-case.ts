/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../entity-base.js';
import type {EntityBaseRow} from '../entity-base.js';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';
import type {UseCaseSubgraphRow} from './use-case-subgraph.schema.js';
import type {UseCaseSubgraphPairRow} from './use-case-subgraph-pair.schema.js';
import type {ValueDefinitionRow} from '../definitions/key-value/value-definition.schema.js';
import {EntitySchema} from 'typeorm';
import {type UsecaseType, USECASE_TYPE} from '@arc/core';

export interface UseCaseBase {
  systemId: number;
  aliasId: number | null;
  alias: string | null;
  fileSystemId: number;
  type?: UsecaseType;
  orderedKeys?: string;
}

export interface UseCaseRow extends EntityBaseRow, UseCaseBase {
  // Relations
  file?: ArcDbFileRow;
  categoryLinks?: UseCaseCategoryJoinRow[];
  subgraphMemberships?: UseCaseSubgraphRow[];
  subgraphPairs?: UseCaseSubgraphPairRow[];
  gkvEntries?: UsecaseGkvValuesRow[];
}

export interface UseCaseCategoryRow extends EntityBaseRow {
  name: string;

  // Relations
  useCaseLinks?: UseCaseCategoryJoinRow[];
}

/** Usecase-to-value relationship scalars keyed by a synthetic system ID. */
export interface UsecaseGkvValuesBase {
  systemId: number;
  usecaseSystemId: number;
  valueDefSystemId: number;
}

export interface UsecaseGkvValuesRow
  extends EntityBaseRow, UsecaseGkvValuesBase {
  useCase?: UseCaseRow;
  valueDef?: ValueDefinitionRow;
}

export const UseCaseSchema = new EntitySchema<UseCaseRow>({
  name: 'UseCase',
  tableName: 'use_cases',
  columns: {
    ...BaseColumnSchemaPart,
    aliasId: {
      type: 'integer',
      name: 'alias_id',
      nullable: true,
    },
    alias: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    fileSystemId: {
      type: 'integer',
      name: 'file_system_id',
    },
    type: {
      type: 'simple-enum',
      enum: Object.values(USECASE_TYPE),
      nullable: true,
      name: 'type',
    },
    orderedKeys: {
      type: 'text',
      nullable: true,
      name: 'ordered_keys',
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
    categoryLinks: {
      type: 'one-to-many',
      target: 'UseCaseCategoryJoin',
      inverseSide: 'useCase',
    },
    subgraphMemberships: {
      type: 'one-to-many',
      target: 'UseCaseSubgraph',
      inverseSide: 'useCase',
    },
    gkvEntries: {
      type: 'one-to-many',
      target: 'UsecaseGkvValues',
      inverseSide: 'useCase',
    },
    subgraphPairs: {
      type: 'one-to-many',
      target: 'UseCaseSubgraphPair',
      inverseSide: 'useCase',
    },
  },
  indices: [
    {
      name: 'ix_use_case_alias',
      columns: ['aliasId'],
    },
    {
      name: 'ix_use_case_file',
      columns: ['fileSystemId'],
    },
  ],
});

export const UseCaseCategorySchema = new EntitySchema<UseCaseCategoryRow>({
  name: 'UseCaseCategory',
  tableName: 'use_case_categories_master',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      unique: true,
    },
  },
  relations: {
    useCaseLinks: {
      type: 'one-to-many',
      target: 'UseCaseCategoryJoin',
      inverseSide: 'category',
    },
  },
});

export const UsecaseGkvValuesSchema = new EntitySchema<UsecaseGkvValuesRow>({
  name: 'UsecaseGkvValues',
  tableName: 'usecase_gkv_values',
  columns: {
    ...BaseColumnSchemaPart,
    usecaseSystemId: {
      name: 'usecase_system_id',
      type: 'integer',
    },
    valueDefSystemId: {
      name: 'value_def_system_id',
      type: 'integer',
    },
  },
  relations: {
    useCase: {
      type: 'many-to-one',
      target: 'UseCase',
      joinColumn: {name: 'usecase_system_id', referencedColumnName: 'systemId'},
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
      name: 'uq_usecase_gkv_values_usecase_value_definition',
      columns: ['usecaseSystemId', 'valueDefSystemId'],
      unique: true,
    },
  ],
});

export interface UseCaseCategoryJoinRow extends EntityBaseRow {
  useCaseSystemId: number;
  categorySystemId: number;
  useCase?: UseCaseRow;
  category?: UseCaseCategoryRow;
}

export const UseCaseCategoryJoinSchema =
  new EntitySchema<UseCaseCategoryJoinRow>({
    name: 'UseCaseCategoryJoin',
    tableName: 'use_case_categories',
    columns: {
      ...BaseColumnSchemaPart,
      useCaseSystemId: {
        name: 'use_case_system_id',
        type: 'integer',
      },
      categorySystemId: {
        name: 'category_system_id',
        type: 'integer',
      },
    },
    relations: {
      useCase: {
        type: 'many-to-one',
        target: 'UseCase',
        inverseSide: 'categoryLinks',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      category: {
        type: 'many-to-one',
        target: 'UseCaseCategory',
        inverseSide: 'useCaseLinks',
        joinColumn: {
          name: 'category_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uq_use_case_categories_usecase_category',
        columns: ['useCaseSystemId', 'categorySystemId'],
        unique: true,
      },
    ],
  });
