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
  UsecaseGkvValuesSchema,
  type UseCaseRow,
} from '../../../entity-schema/usecase-data/use-case.js';
import {UseCaseSubgraphSchema} from '../../../entity-schema/usecase-data/use-case-subgraph.schema.js';
import {UseCaseSubgraphPairSchema} from '../../../entity-schema/usecase-data/use-case-subgraph-pair.schema.js';

export class UseCaseInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: UseCase[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));

    const rootStep = await this.insertUseCaseRows(items);
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const [gkvStep, subgraphStep, pairStep] = await Promise.all([
      this.insertGkvRows(activeItems),
      this.insertSubgraphRows(activeItems),
      this.insertSubgraphPairRows(activeItems),
    ]);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...gkvStep.rawFailures,
      ...subgraphStep.rawFailures,
      ...pairStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      bySystemId,
      uc => `UseCase (systemId=${uc.systemId}, aliasId=${uc.aliasId ?? 0})`,
    );
  }

  private async insertUseCaseRows(items: UseCase[]): Promise<StepResult> {
    const rows: InsertRow<UseCaseRow>[] = items.map(item => ({
      systemId: item.systemId,
      aliasId: item.aliasId ?? 0,
      alias: item.alias ?? '',
      fileSystemId: item.fileSystemId,
      type: item.type,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      UseCaseSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = items.find(i => i.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'UseCase',
        failedRowJson: `(systemId=${item.systemId}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertGkvRows(items: UseCase[]): Promise<StepResult> {
    const allRows = items.flatMap(item =>
      item.keyVector.valueSystemIds.map(valueSystemId => ({
        usecaseSystemId: item.systemId,
        valueDefSystemId: valueSystemId,
      })),
    );

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const rawFailures: RawFailure[] = [];

    try {
      await this.manager.insert(UsecaseGkvValuesSchema, allRows);
    } catch {
      for (const row of allRows) {
        try {
          await this.manager.insert(UsecaseGkvValuesSchema, row);
        } catch (rowError: unknown) {
          const item = items.find(i => i.systemId === row.usecaseSystemId)!;
          rawFailures.push({
            systemId: item.systemId,
            entityLabel: 'UsecaseGkvValues',
            failedRowJson: `(systemId=${item.systemId}) Row: ${JSON.stringify(row)}`,
            dbError:
              rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }
    }

    return {rawFailures, failedEntityIds: new Set()};
  }

  private async insertSubgraphRows(items: UseCase[]): Promise<StepResult> {
    const allRows = items.flatMap(item =>
      item.subgraphSystemIds.map(subgraphSystemId => ({
        usecaseSystemId: item.systemId,
        subgraphSystemId,
      })),
    );

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const rawFailures: RawFailure[] = [];

    try {
      await this.manager.insert(UseCaseSubgraphSchema, allRows);
    } catch {
      for (const row of allRows) {
        try {
          await this.manager.insert(UseCaseSubgraphSchema, row);
        } catch (rowError: unknown) {
          const item = items.find(i => i.systemId === row.usecaseSystemId)!;
          rawFailures.push({
            systemId: item.systemId,
            entityLabel: 'UseCaseSubgraph',
            failedRowJson: `(systemId=${item.systemId}, subgraphSystemId=${row.subgraphSystemId}) Row: ${JSON.stringify(row)}`,
            dbError:
              rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }
    }

    return {rawFailures, failedEntityIds: new Set()};
  }

  private async insertSubgraphPairRows(items: UseCase[]): Promise<StepResult> {
    const allRows = items.flatMap(item =>
      item.subgraphPairs.map(pair => ({
        usecaseSystemId: item.systemId,
        sourceSubgraphSystemId: pair.sourceSubgraphSystemId,
        destSubgraphSystemId: pair.destSubgraphSystemId,
      })),
    );

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const rawFailures: RawFailure[] = [];

    try {
      await this.manager.insert(UseCaseSubgraphPairSchema, allRows);
    } catch {
      for (const row of allRows) {
        try {
          await this.manager.insert(UseCaseSubgraphPairSchema, row);
        } catch (rowError: unknown) {
          const item = items.find(i => i.systemId === row.usecaseSystemId)!;
          rawFailures.push({
            systemId: item.systemId,
            entityLabel: 'UseCaseSubgraphPair',
            failedRowJson: `(systemId=${item.systemId}, sourceSg=${row.sourceSubgraphSystemId}, destSg=${row.destSubgraphSystemId}) Row: ${JSON.stringify(row)}`,
            dbError:
              rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }
    }

    return {rawFailures, failedEntityIds: new Set()};
  }
}
