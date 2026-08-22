/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, IdGenerationPort, UseCase} from '@arc/core';
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
  UseCaseCategorySchema,
  UsecaseGkvValuesSchema,
  UseCaseCategoryJoinSchema,
  type UseCaseRow,
  type UseCaseCategoryRow,
} from '../../../entity-schema/usecase-data/use-case.js';
import {
  UseCaseSubgraphSchema,
  type UseCaseSubgraphBase,
} from '../../../entity-schema/usecase-data/use-case-subgraph.schema.js';
import {
  UseCaseSubgraphPairSchema,
  type UseCaseSubgraphPairBase,
} from '../../../entity-schema/usecase-data/use-case-subgraph-pair.schema.js';

export class UseCaseInserter {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async insert(items: UseCase[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));

    const rootStep = await this.insertUseCaseRows(items);
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const [gkvStep, subgraphStep, pairStep, categoryStep] = await Promise.all([
      this.insertGkvRows(activeItems),
      this.insertSubgraphRows(activeItems),
      this.insertSubgraphPairRows(activeItems),
      this.insertCategoryRows(activeItems),
    ]);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...gkvStep.rawFailures,
      ...subgraphStep.rawFailures,
      ...pairStep.rawFailures,
      ...categoryStep.rawFailures,
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
      isEc: item.isEc,
      skipRouting: item.skipRouting,
      orderedKeys: item.orderedKeys
        ? JSON.stringify(item.orderedKeys)
        : undefined,
      reviewedAt: item.reviewedAt,
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
    const allRows: UseCaseSubgraphBase[] = [];
    const ownerBySystemId = new Map<number, UseCase>();

    for (const item of items) {
      for (const subgraphSystemId of item.subgraphSystemIds) {
        const systemId = await this.idGeneration.getNextId(item.fileSystemId);
        allRows.push({
          systemId,
          usecaseSystemId: item.systemId,
          subgraphSystemId,
        });
        ownerBySystemId.set(systemId, item);
      }
    }

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      UseCaseSubgraphSchema,
      allRows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = ownerBySystemId.get(error.systemId)!;
      const row = allRows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'UseCaseSubgraph',
        failedRowJson: `(systemId=${item.systemId}, subgraphSystemId=${row.subgraphSystemId}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {rawFailures, failedEntityIds: new Set()};
  }

  private async insertSubgraphPairRows(items: UseCase[]): Promise<StepResult> {
    const allRows: UseCaseSubgraphPairBase[] = [];
    const ownerBySystemId = new Map<number, UseCase>();

    for (const item of items) {
      for (const pair of item.subgraphPairs) {
        const systemId = await this.idGeneration.getNextId(item.fileSystemId);
        allRows.push({
          systemId,
          usecaseSystemId: item.systemId,
          sourceSubgraphSystemId: pair.sourceSubgraphSystemId,
          destSubgraphSystemId: pair.destSubgraphSystemId,
        });
        ownerBySystemId.set(systemId, item);
      }
    }

    if (allRows.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      UseCaseSubgraphPairSchema,
      allRows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = ownerBySystemId.get(error.systemId)!;
      const row = allRows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'UseCaseSubgraphPair',
        failedRowJson: `(systemId=${item.systemId}, sourceSg=${row.sourceSubgraphSystemId}, destSg=${row.destSubgraphSystemId}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {rawFailures, failedEntityIds: new Set()};
  }

  private async insertCategoryRows(items: UseCase[]): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];

    const categoryNames = [
      ...new Set(items.flatMap(i => i.categories ?? [])),
    ].filter(name => name.length > 0);

    if (categoryNames.length === 0)
      return {rawFailures: [], failedEntityIds: new Set()};

    const {categorySystemIdByName, upsertFailures} =
      await this.upsertCategories(categoryNames, items);
    rawFailures.push(...upsertFailures);

    for (const item of items) {
      const failures = await this.insertCategoryJoinRows(
        item,
        categorySystemIdByName,
      );
      rawFailures.push(...failures);
    }

    return {rawFailures, failedEntityIds: new Set()};
  }

  private async upsertCategories(
    categoryNames: string[],
    items: UseCase[],
  ): Promise<{
    categorySystemIdByName: Map<string, number>;
    upsertFailures: RawFailure[];
  }> {
    const categorySystemIdByName = new Map<string, number>();
    const upsertFailures: RawFailure[] = [];
    for (const name of categoryNames) {
      try {
        await this.manager
          .createQueryBuilder()
          .insert()
          .into(UseCaseCategorySchema)
          .values({name} as Partial<UseCaseCategoryRow>)
          .orIgnore()
          .execute();
        const row = await this.manager.findOne<UseCaseCategoryRow>(
          UseCaseCategorySchema,
          {where: {name} as {name: string}},
        );
        if (row) categorySystemIdByName.set(name, row.systemId);
      } catch (error: unknown) {
        const dbError = error instanceof Error ? error.message : String(error);
        for (const item of items.filter(i => i.categories?.includes(name))) {
          upsertFailures.push({
            systemId: item.systemId,
            entityLabel: 'UseCaseCategory',
            failedRowJson: `(category='${name}')`,
            dbError,
          });
        }
      }
    }
    return {categorySystemIdByName, upsertFailures};
  }

  private async insertCategoryJoinRows(
    item: UseCase,
    categorySystemIdByName: Map<string, number>,
  ): Promise<RawFailure[]> {
    const rawFailures: RawFailure[] = [];
    for (const categoryName of item.categories ?? []) {
      const categorySystemId = categorySystemIdByName.get(categoryName);
      if (!categorySystemId) continue;
      try {
        await this.manager
          .createQueryBuilder()
          .insert()
          .into(UseCaseCategoryJoinSchema)
          .values({
            useCaseSystemId: item.systemId,
            categorySystemId: categorySystemId,
          })
          .orIgnore()
          .execute();
      } catch (error: unknown) {
        rawFailures.push({
          systemId: item.systemId,
          entityLabel: 'UseCaseCategory',
          failedRowJson: `(usecaseSystemId=${item.systemId}, categoryName=${categoryName})`,
          dbError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return rawFailures;
  }
}
