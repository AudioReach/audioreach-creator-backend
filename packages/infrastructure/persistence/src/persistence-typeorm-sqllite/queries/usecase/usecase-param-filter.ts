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
 *   spfModuleInstanceId — filter usecases that contain a module with this instance ID
 *   subgraphId          — filter usecases that reference this subgraph
 *   containerId         — filter usecases that contain a module in this container
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
    name: 'spfModuleInstanceId',
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
        .innerJoin(ENTITY_NAMES.Node, 'n', 'n.system_id = sm.system_id')
        .where(`ucs.usecase_system_id = ${alias}.system_id`)
        .andWhere(`n.module_id = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (uc as unknown as {modules?: Array<{moduleId: number}>}).modules?.some(
        m => m.moduleId === value,
      ) ?? false,
  })

  .register({
    name: 'subgraphId',
    valueType: 'number',
    addCondition: (qb, value, key, alias) => {
      const sub = (qb as unknown as SelectQueryBuilder<Record<string, unknown>>)
        .subQuery()
        .select('1')
        .from(ENTITY_NAMES.UseCaseSubgraph, 'ucs')
        .where(`ucs.usecase_system_id = ${alias}.system_id`)
        .andWhere(`ucs.subgraph_system_id = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (
        uc as unknown as {
          subgraphMemberships?: Array<{subgraphSystemId: number}>;
        }
      ).subgraphMemberships?.some(
        membership => membership.subgraphSystemId === value,
      ) ?? false,
  })

  .register({
    name: 'containerId',
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
        .andWhere(`sm.container_system_id = :${key}`)
        .getQuery();
      qb.andWhere(`EXISTS ${sub}`, {[key]: value});
    },
    evaluate: (uc, value) =>
      (uc as unknown as {modules?: Array<{containerId: number}>}).modules?.some(
        m => m.containerId === value,
      ) ?? false,
  });
