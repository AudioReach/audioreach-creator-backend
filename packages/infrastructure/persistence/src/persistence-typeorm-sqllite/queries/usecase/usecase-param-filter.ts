/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ParamFilter} from '../shared/param-filter.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {SelectQueryBuilder} from 'typeorm';
import type {UseCaseRow} from '../../entity-schema/index.js';

/**
 * ParamFilter definition for GET /usecases.
 *
 * Registered fields:
 *   spfModuleInstanceNaturalId — filter usecases that contain a module with this instance ID
 *   subgraphNaturalId          — filter usecases that reference this subgraph
 *   containerNaturalId         — filter usecases that contain a module in this container
 *
 * Each field's addCondition() adds an EXISTS subquery to the 'uc' QueryBuilder alias.
 * Adding a new filterable field: one .register() call, no other code changes required.
 *
 * WHY subQuery() instead of raw SQL template strings:
 *   ENTITY_NAMES values are TypeORM entity names (e.g. 'UseCaseSubgraph'), not SQLite
 *   table names (e.g. 'use_case_subgraphs'). TypeORM only resolves entity-to-table
 *   mapping through its own ORM methods (.from(), .innerJoin(), etc.). A raw SQL string
 *   passed to .andWhere() bypasses that resolution and hits SQLite verbatim — causing
 *   "no such table: UseCaseSubgraph". Using .subQuery().from(ENTITY_NAMES.X) lets
 *   TypeORM resolve the entity name correctly before generating the SQL.
 *
 *   The (qb as any).subQuery() cast is required because addCondition receives the narrow
 *   WhereExpressionBuilder interface (shared with Brackets), which does not expose
 *   .subQuery(). At runtime it is always a SelectQueryBuilder that has the method.
 */
export const USECASE_PARAM_FILTER = new ParamFilter<UseCaseRow>()

  .register({
    name: 'spfModuleInstanceNaturalId',
    valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      const sub = (qb as unknown as SelectQueryBuilder<Record<string, unknown>>)
        .subQuery()
        .select('1')
        .from(ENTITY_NAMES.UseCaseSubgraph, 'ucs')
        .innerJoin(
          ENTITY_NAMES.SpfModule,
          'sm',
          'sm.subgraph_system_id = ucs.subgraph_system_id',
        )
        .where(`ucs.usecase_system_id = ${alias}.system_id`)
        .andWhere(`sm.naturalId = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (
        uc as unknown as {modules?: Array<{moduleNaturalId: number}>}
      ).modules?.some(m => m.moduleNaturalId === value) ?? false,
  })

  .register({
    name: 'subgraphNaturalId',
    valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      const sub = (qb as unknown as SelectQueryBuilder<Record<string, unknown>>)
        .subQuery()
        .select('1')
        .from(ENTITY_NAMES.UseCaseSubgraph, 'ucs')
        .innerJoin(
          ENTITY_NAMES.Subgraph,
          'sg',
          'sg.system_id = ucs.subgraph_system_id',
        )
        .where(`ucs.usecase_system_id = ${alias}.system_id`)
        .andWhere(`sg.subgraph_id = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (
        uc as unknown as {
          subgraphMemberships?: Array<{subgraphNaturalId: number}>;
        }
      ).subgraphMemberships?.some(
        membership => membership.subgraphNaturalId === value,
      ) ?? false,
  })

  .register({
    name: 'containerNaturalId',
    valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      const sub = (qb as unknown as SelectQueryBuilder<Record<string, unknown>>)
        .subQuery()
        .select('1')
        .from(ENTITY_NAMES.UseCaseSubgraph, 'ucs')
        .innerJoin(
          ENTITY_NAMES.SpfModule,
          'sm',
          'sm.subgraph_system_id = ucs.subgraph_system_id',
        )
        .innerJoin(
          ENTITY_NAMES.Container,
          'c',
          'c.system_id = sm.container_system_id',
        )
        .where(`ucs.usecase_system_id = ${alias}.system_id`)
        .andWhere(`c.container_id = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (
        uc as unknown as {modules?: Array<{containerNaturalId: number}>}
      ).modules?.some(m => m.containerNaturalId === value) ?? false,
  });
