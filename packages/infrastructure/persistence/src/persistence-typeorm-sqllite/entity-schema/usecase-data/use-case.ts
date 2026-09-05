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
  aliasId: number;
  alias: string;
  fileSystemId: number;
  type?: UsecaseType;
  orderedKeys?: string;
  reviewedAt?: string;

export interface UseCaseRow extends EntityBaseRow, UseCaseBase {
  // Relations
  file?: ArcDbFileRow;
  categories?: UseCaseCategoryRow[];
  subgraphMemberships?: UseCaseSubgraphRow[];
  subgraphPairs?: UseCaseSubgraphPairRow[];
  gkvEntries?: UsecaseGkvValuesRow[];
}

export interface UseCaseCategoryRow extends EntityBaseRow {
  name: string;

  // Relations
  useCases?: UseCaseRow[];
}

/** Composite-PK join table scalars — not overlaid. */
export interface UsecaseGkvValuesBase {
  usecaseSystemId: number;
  valueDefSystemId: number;
}

export interface UsecaseGkvValuesRow extends UsecaseGkvValuesBase {
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
    },
    alias: {
      type: 'varchar',
      length: 255,
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
    reviewedAt: {
      type: 'varchar',
      length: 100,
      nullable: true,
      name: 'reviewed_at',
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
    categories: {
      type: 'many-to-many',
      target: 'UseCaseCategory',
      joinTable: {
        name: 'use_case_categories',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'category_system_id',
          referencedColumnName: 'systemId',
        },
      },
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
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'categories',
    },
  },
});

export const UsecaseGkvValuesSchema = new EntitySchema<UsecaseGkvValuesRow>({
  name: 'UsecaseGkvValues',
  tableName: 'usecase_gkv_values',
  columns: {
    usecaseSystemId: {
      name: 'usecase_system_id',
      type: 'integer',
      primary: true,
    },
    valueDefSystemId: {
      name: 'value_def_system_id',
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

export interface UseCaseCategoryJoinRow {
  useCaseSystemId: number;
  categorySystemId: number;
}

export const UseCaseCategoryJoinSchema =
  new EntitySchema<UseCaseCategoryJoinRow>({
    name: 'UseCaseCategoryJoin',
    tableName: 'use_case_categories',
    columns: {
      useCaseSystemId: {
        name: 'use_case_system_id',
        type: 'integer',
        primary: true,
      },
      categorySystemId: {
        name: 'category_system_id',
        type: 'integer',
        primary: true,
      },
    },
  });
