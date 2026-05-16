/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, UseCase} from '@arc/core';
import {okBulkInsert} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  UseCaseSchema,
  type UseCaseRow,
  UsecaseGkvValuesSchema,
  type UsecaseGkvValuesRow,
} from '../../../entity-schema/usecase-data/use-case.js';

interface UseCaseNodesRow extends Record<string, unknown> {
  use_case_system_id: number;
  node_system_id: number;
}

interface UseCaseDataLinksRow extends Record<string, unknown> {
  use_case_system_id: number;
  data_link_system_id: number;
}

interface UseCaseControlLinksRow extends Record<string, unknown> {
  use_case_system_id: number;
  control_link_system_id: number;
}

export class UsecaseInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: UseCase[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));

    const usecaseStep = await this.insertUsecases(items);
    const nodesStep = await this.insertUsecaseNodes(
      items,
      usecaseStep.failedEntityIds,
    );

    // Accumulate failures from previous steps
    const dataLinksSkipSet = new Set([
      ...usecaseStep.failedEntityIds,
      ...nodesStep.failedEntityIds,
    ]);
    const dataLinksStep = await this.insertUsecaseDataLinks(
      items,
      dataLinksSkipSet,
    );

    const controlLinksSkipSet = new Set([
      ...usecaseStep.failedEntityIds,
      ...nodesStep.failedEntityIds,
      ...dataLinksStep.failedEntityIds,
    ]);
    const controlLinksStep = await this.insertUsecaseControlLinks(
      items,
      controlLinksSkipSet,
    );

    const gkvSkipSet = new Set([
      ...usecaseStep.failedEntityIds,
      ...nodesStep.failedEntityIds,
      ...dataLinksStep.failedEntityIds,
      ...controlLinksStep.failedEntityIds,
    ]);
    const gkvStep = await this.insertUsecaseGkvValues(items, gkvSkipSet);

    const allFailures = [
      ...usecaseStep.rawFailures,
      ...nodesStep.rawFailures,
      ...dataLinksStep.rawFailures,
      ...controlLinksStep.rawFailures,
      ...gkvStep.rawFailures,
    ];

    return groupRawFailures(
      allFailures,
      bySystemId,
      item =>
        `UseCase (systemId=${item.systemId}, alias='${item.alias ?? 'N/A'}')`,
    );
  }

  private async insertUsecases(items: UseCase[]): Promise<StepResult> {
    const rows: InsertRow<UseCaseRow>[] = items.map(usecase => ({
      systemId: usecase.systemId,
      aliasId: usecase.aliasId ?? 0,
      alias: usecase.alias ?? '',
      fileSystemId: usecase.fileSystemId,
    }));

    // Build context map from items directly
    const contextBySystemId = new Map(items.map(u => [u.systemId, u]));

    if (rows.length === 0) return {rawFailures: [], failedEntityIds: new Set()};

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      UseCaseSchema,
      rows,
      100,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.systemId,
        entityLabel: 'UseCase',
        failedRowJson: `(systemId=${ctx.systemId}, alias='${ctx.alias ?? 'N/A'}') Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  /**
   * Generic helper for inserting join-table rows with bulk insert + fallback pattern.
   * Consolidates the repeated pattern used for nodes, dataLinks, and controlLinks.
   */
  private async insertJoinTable<TRow extends Record<string, unknown>>(
    tableName: string,
    items: UseCase[],
    failedUsecaseIds: Set<number>,
    getRelationIds: (usecase: UseCase) => number[],
    buildRow: (usecaseSystemId: number, relationId: number) => TRow,
    entityLabel: string,
  ): Promise<StepResult> {
    // Filter out failed usecases and collect all join-table entries
    const allRows: TRow[] = items
      .filter(usecase => !failedUsecaseIds.has(usecase.systemId))
      .flatMap(usecase =>
        getRelationIds(usecase).map(relationId =>
          buildRow(usecase.systemId, relationId),
        ),
      );

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    // Try bulk insert first
    try {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into(tableName)
        .values(allRows)
        .execute();
      return {rawFailures: [], failedEntityIds: new Set()};
    } catch {
      // If bulk insert fails, fall back to individual inserts
      return this.insertJoinTableWithFallback(
        tableName,
        items,
        failedUsecaseIds,
        getRelationIds,
        buildRow,
        entityLabel,
      );
    }
  }

  /**
   * Fallback method for join-table insertion that processes each usecase individually.
   */
  private async insertJoinTableWithFallback<
    TRow extends Record<string, unknown>,
  >(
    tableName: string,
    items: UseCase[],
    failedUsecaseIds: Set<number>,
    getRelationIds: (usecase: UseCase) => number[],
    buildRow: (usecaseSystemId: number, relationId: number) => TRow,
    entityLabel: string,
  ): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];
    const failedEntityIds = new Set<number>();

    for (const usecase of items) {
      if (failedUsecaseIds.has(usecase.systemId)) continue;

      const relationIds = getRelationIds(usecase);
      if (relationIds.length === 0) continue;

      const rows: TRow[] = relationIds.map(relationId =>
        buildRow(usecase.systemId, relationId),
      );

      try {
        await this.manager
          .createQueryBuilder()
          .insert()
          .into(tableName)
          .values(rows)
          .execute();
      } catch (error) {
        failedEntityIds.add(usecase.systemId);
        rawFailures.push({
          systemId: usecase.systemId,
          entityLabel,
          failedRowJson: `${entityLabel} for systemId=${usecase.systemId}, alias='${usecase.alias ?? 'N/A'}'. Rows: ${JSON.stringify(rows)}`,
          dbError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {rawFailures, failedEntityIds};
  }

  private async insertUsecaseNodes(
    items: UseCase[],
    failedUsecaseIds: Set<number>,
  ): Promise<StepResult> {
    return this.insertJoinTable<UseCaseNodesRow>(
      'use_case_nodes',
      items,
      failedUsecaseIds,
      usecase => usecase.moduleSystemIds,
      (usecaseSystemId, nodeSystemId) => ({
        use_case_system_id: usecaseSystemId,
        node_system_id: nodeSystemId,
      }),
      'UseCaseNodes',
    );
  }

  private async insertUsecaseDataLinks(
    items: UseCase[],
    failedUsecaseIds: Set<number>,
  ): Promise<StepResult> {
    return this.insertJoinTable<UseCaseDataLinksRow>(
      'use_case_data_links',
      items,
      failedUsecaseIds,
      usecase => usecase.dataLinkSystemIds,
      (usecaseSystemId, dataLinkSystemId) => ({
        use_case_system_id: usecaseSystemId,
        data_link_system_id: dataLinkSystemId,
      }),
      'UseCaseDataLinks',
    );
  }

  private async insertUsecaseControlLinks(
    items: UseCase[],
    failedUsecaseIds: Set<number>,
  ): Promise<StepResult> {
    return this.insertJoinTable<UseCaseControlLinksRow>(
      'use_case_control_links',
      items,
      failedUsecaseIds,
      usecase => usecase.controlLinkSystemIds,
      (usecaseSystemId, controlLinkSystemId) => ({
        use_case_system_id: usecaseSystemId,
        control_link_system_id: controlLinkSystemId,
      }),
      'UseCaseControlLinks',
    );
  }

  private async insertUsecaseGkvValues(
    items: UseCase[],
    failedUsecaseIds: Set<number>,
  ): Promise<StepResult> {
    // Filter out failed usecases and collect all GKV value entries
    const allValueRows: UsecaseGkvValuesRow[] = items
      .filter(usecase => !failedUsecaseIds.has(usecase.systemId))
      .flatMap(usecase =>
        usecase.keyVector.valueSystemIds.map(valueSystemId => ({
          usecaseSystemId: usecase.systemId,
          valueDefSystemId: valueSystemId,
        })),
      );

    if (allValueRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    // Try bulk insert first
    try {
      await this.manager.insert(UsecaseGkvValuesSchema, allValueRows);
      return {rawFailures: [], failedEntityIds: new Set()};
    } catch {
      // If bulk insert fails, fall back to individual inserts
      return this.insertUsecaseGkvValuesWithFallback(items, failedUsecaseIds);
    }
  }

  private async insertUsecaseGkvValuesWithFallback(
    items: UseCase[],
    failedUsecaseIds: Set<number>,
  ): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];
    const failedEntityIds = new Set<number>();

    for (const usecase of items) {
      if (failedUsecaseIds.has(usecase.systemId)) continue;
      if (usecase.keyVector.valueSystemIds.length === 0) continue;

      const valueRows: UsecaseGkvValuesRow[] =
        usecase.keyVector.valueSystemIds.map(valueSystemId => ({
          usecaseSystemId: usecase.systemId,
          valueDefSystemId: valueSystemId,
        }));

      try {
        await this.manager.insert(UsecaseGkvValuesSchema, valueRows);
      } catch (error) {
        failedEntityIds.add(usecase.systemId);
        rawFailures.push({
          systemId: usecase.systemId,
          entityLabel: 'UsecaseGkvValues',
          failedRowJson: `UseCase GKV values for systemId=${usecase.systemId}, alias='${usecase.alias ?? 'N/A'}'. Rows: ${JSON.stringify(valueRows)}`,
          dbError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {rawFailures, failedEntityIds};
  }
}
