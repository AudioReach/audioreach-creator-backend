/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  DriverModule,
  BulkInsertResult,
  DkvData,
  IdGenerationPort,
} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {emptyStepResult} from '../common/step-result.js';
import type {StepResult} from '../common/step-result.js';
import {
  DriverModuleSchema,
  type DriverModuleRow,
  DkvValuesSchema,
  type DkvRow,
  type DkvParameterPayloadRow,
  type DkvValuesRow,
} from '../../../entity-schema/driver-module-data/driver-module.js';

export class DriverModuleInserter implements BulkInserter<DriverModule> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async insert(modules: DriverModule[]): Promise<BulkInsertResult> {
    if (modules.length === 0) return okBulkInsert();

    const bySystemId = new Map(modules.map(m => [m.systemId, m]));

    const rootStep = await this.insertDriverModules(modules);

    const activeModules = modules.filter(
      m => !rootStep.failedEntityIds.has(m.systemId),
    );

    const dkvRowStep = await this.insertDkvRows(activeModules);
    const dkvValuesStep = await this.insertDkvValues(
      activeModules,
      dkvRowStep.failedEntityIds,
    );
    const paramStep = await this.insertDkvParameterPayloads(
      activeModules,
      new Set([
        ...dkvRowStep.failedEntityIds,
        ...dkvValuesStep.failedEntityIds,
      ]),
    );

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...dkvRowStep.rawFailures,
      ...dkvValuesStep.rawFailures,
      ...paramStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      bySystemId,
      m =>
        `DriverModule (definitionSystemId=${BinaryUtils.toHexString(m.definitionSystemId)}, systemId=${m.systemId})`,
    );
  }

  private async insertDriverModules(
    modules: DriverModule[],
  ): Promise<StepResult> {
    const rows: InsertRow<DriverModuleRow>[] = modules.map(m => ({
      systemId: m.systemId,
      definitionSystemId: m.definitionSystemId,
      fileSystemId: m.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: module.systemId,
        entityLabel: 'DriverModule',
        failedRowJson: `(definitionSystemId=${BinaryUtils.toHexString(module.definitionSystemId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertDkvRows(modules: DriverModule[]): Promise<StepResult> {
    const contextByDkvSystemId = new Map<
      number,
      {dkv: DkvData; module: DriverModule}
    >();

    const rows: InsertRow<DkvRow>[] = modules.flatMap(m =>
      m.dkvData.map(dkv => {
        contextByDkvSystemId.set(dkv.systemId, {dkv, module: m});
        return {
          systemId: dkv.systemId,
          driverModuleSystemId: m.systemId,
        };
      }),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert<DkvRow>(
      this.manager,
      'Dkv',
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByDkvSystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'DKV',
        failedRowJson: `(definitionSystemId=${BinaryUtils.toHexString(ctx.module.definitionSystemId)}, dkvSystemId=${ctx.dkv.systemId}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertDkvValues(
    modules: DriverModule[],
    failedDkvIds: Set<number>,
  ): Promise<StepResult> {
    const contextByDkvSystemId = new Map<
      number,
      {dkv: DkvData; module: DriverModule}
    >();

    const rows: DkvValuesRow[] = modules.flatMap(m =>
      m.dkvData
        .filter(dkv => !failedDkvIds.has(dkv.systemId))
        .flatMap(dkv => {
          contextByDkvSystemId.set(dkv.systemId, {dkv, module: m});
          return dkv.valueDefinitionSystemIds.map(valueId => ({
            dkvSystemId: dkv.systemId,
            valueDefSystemId: valueId,
          }));
        }),
    );

    if (rows.length === 0) return emptyStepResult();

    try {
      await this.manager.insert(DkvValuesSchema, rows);
      return emptyStepResult();
    } catch {
      return this.insertDkvValuesWithFallback(
        contextByDkvSystemId,
        failedDkvIds,
      );
    }
  }

  private async insertDkvValuesWithFallback(
    context: Map<number, {dkv: DkvData; module: DriverModule}>,
    failedDkvIds: Set<number>,
  ): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];
    const failedEntityIds = new Set<number>();

    for (const [dkvSystemId, {dkv, module}] of context) {
      if (failedDkvIds.has(dkvSystemId)) continue;
      if (dkv.valueDefinitionSystemIds.length === 0) continue;

      const valueRows: DkvValuesRow[] = dkv.valueDefinitionSystemIds.map(
        valueId => ({dkvSystemId, valueDefSystemId: valueId}),
      );

      try {
        await this.manager.insert(DkvValuesSchema, valueRows);
      } catch (error) {
        await this.manager.delete('Dkv', {systemId: dkvSystemId});
        failedEntityIds.add(dkvSystemId);
        rawFailures.push({
          systemId: module.systemId,
          entityLabel: 'DKV Values',
          failedRowJson: `(definitionSystemId=${BinaryUtils.toHexString(module.definitionSystemId)}, dkvSystemId=${dkvSystemId}) Rows: ${JSON.stringify(valueRows)}`,
          dbError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {rawFailures, failedEntityIds};
  }

  private async insertDkvParameterPayloads(
    modules: DriverModule[],
    failedDkvIds: Set<number>,
  ): Promise<StepResult> {
    const paramEntries = modules.flatMap(m =>
      m.dkvData
        .filter(dkv => !failedDkvIds.has(dkv.systemId))
        .flatMap(dkv =>
          dkv.parameterPayloads.map(param => ({param, dkv, module: m})),
        ),
    );

    if (paramEntries.length === 0) return emptyStepResult();

    const fileId = modules[0].fileSystemId;
    const rows: InsertRow<DkvParameterPayloadRow>[] = [];
    const contextBySystemId = new Map<
      number,
      {dkv: DkvData; module: DriverModule}
    >();

    for (const entry of paramEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        parameterSystemId: entry.param.paramDefintionSystemId,
        dkvSystemId: entry.dkv.systemId,
        payload: entry.param.getPayloadCopy(),
      });
      contextBySystemId.set(systemId, {dkv: entry.dkv, module: entry.module});
    }

    const {failedEntities} = await BatchInserter.insert<DkvParameterPayloadRow>(
      this.manager,
      'DkvParameterPayload',
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'DKV Parameter',
        failedRowJson: `(definitionSystemId=${BinaryUtils.toHexString(ctx.module.definitionSystemId)}, dkvSystemId=${ctx.dkv.systemId}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
