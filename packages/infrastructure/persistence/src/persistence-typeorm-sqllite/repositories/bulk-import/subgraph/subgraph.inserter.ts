/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  Subgraph,
  BulkInsertError,
  BulkInsertResult,
  KvData,
  IdGenerationPort,
} from '@arc/core';
import {errBulkInsert, okBulkInsert} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {
  SubgraphSchema,
  type SubgraphRow,
} from '../../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataRow} from '../../../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import {
  VcpmInstanceSchema,
  VcpmCkvSchema,
  VcpmCkvValuesSchema,
  type VcpmInstanceRow,
  type VcpmCkvRow,
  type VcpmCkvValuesRow,
  type VcpmParameterPayloadRow,
} from '../../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

/**
 * Inserts Subgraph domain entities and all their children into the database
 * using ordered bulk batch inserts.
 *
 * All insert steps are always attempted regardless of prior failures.
 *
 * Insert order (FK-safe):
 *   Subgraph → SubgraphPropertyData → VcpmInstance → VcpmCkv → VcpmParameterPayload
 */
export class SubgraphInserter implements BulkInserter<Subgraph> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  /**
   * Inserts all Subgraph entities and their children in FK-safe order.
   * Failures are grouped by Subgraph aggregate and returned as
   * `BulkInsertError[]` — one entry per failing subgraph.
   * @returns BulkInsertResult — ok if all inserts succeeded, err otherwise.
   */
  public async insert(subgraphs: Subgraph[]): Promise<BulkInsertResult> {
    if (subgraphs.length === 0) return okBulkInsert();

    const subgraphBySystemId = new Map(subgraphs.map(s => [s.systemId, s]));

    const rawFailures: RawFailure[] = [
      ...(await this.insertSubgraphs(subgraphs)),
      ...(await this.insertSubgraphPropertyData(subgraphs)),
      ...(await this.insertVcpmInstances(subgraphs)),
      ...(await this.insertVcpmCkvs(subgraphs)),
      ...(await this.insertVcpmParameterPayloads(subgraphs)),
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by Subgraph systemId.
    const grouped = new Map<number, string[]>();
    for (const f of rawFailures) {
      if (!grouped.has(f.systemId)) grouped.set(f.systemId, []);
      grouped
        .get(f.systemId)!
        .push(
          `${f.entityLabel}: Failed to insert\n${f.failedRowJson}\nerror: ${f.dbError}`,
        );
    }

    const errors: BulkInsertError[] = [...grouped.entries()].map(
      ([systemId, lines]) => {
        const subgraph = subgraphBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Subgraph {subgraphId=${subgraph.subgraphId}, systemId=${subgraph.systemId}}`,
          details: lines.join('\n'),
        };
      },
    );

    return errBulkInsert(errors);
  }

  // ─── Subgraph ─────────────────────────────────────────────────────────────────

  private async insertSubgraphs(subgraphs: Subgraph[]): Promise<RawFailure[]> {
    const rows: InsertRow<SubgraphRow>[] = subgraphs.map(s => ({
      systemId: s.systemId,
      subgraphId: s.subgraphId,
      name: s.name,
      isExported: s.isExported,
      fileSystemId: s.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubgraphSchema,
      rows,
    );

    return failedEntities.map(error => {
      const subgraph = subgraphs.find(s => s.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: subgraph.systemId,
        entityLabel: 'Subgraph',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Subgraph Property Data ───────────────────────────────────────────────────

  private async insertSubgraphPropertyData(
    subgraphs: Subgraph[],
  ): Promise<RawFailure[]> {
    const propEntries = subgraphs.flatMap(s =>
      s.properties.map(prop => ({prop, subgraph: s})),
    );

    if (propEntries.length === 0) return [];

    // Generate a unique systemId for each property data row
    const fileId = subgraphs[0].fileSystemId;
    const rows: InsertRow<SubgraphPropertyDataRow>[] = [];
    const contextBySystemId = new Map<number, {readonly subgraph: Subgraph}>();

    for (const entry of propEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        subgraphSystemId: entry.subgraph.systemId,
        subgraphPropertySystemId: entry.prop.propertyDefinitionSystemId,
        payload: entry.prop.getPayloadCopy()!,
      });
      contextBySystemId.set(systemId, {subgraph: entry.subgraph});
    }

    const {failedEntities} =
      await BatchInserter.insert<SubgraphPropertyDataRow>(
        this.manager,
        'SubgraphPropertyData',
        rows,
      );

    return failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'Subgraph Property Data',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── VcpmInstance ─────────────────────────────────────────────────────────────

  private async insertVcpmInstances(
    subgraphs: Subgraph[],
  ): Promise<RawFailure[]> {
    const vcpmEntries = subgraphs
      .filter(s => s.vcpmDataInstance !== null)
      .map(s => ({vcpm: s.vcpmDataInstance!, subgraph: s}));

    if (vcpmEntries.length === 0) return [];

    const contextBySystemId = new Map<number, {readonly subgraph: Subgraph}>(
      vcpmEntries.map(e => [e.vcpm.systemId, {subgraph: e.subgraph}]),
    );

    const rows: InsertRow<VcpmInstanceRow>[] = vcpmEntries.map(e => ({
      systemId: e.vcpm.systemId,
      subgraphSystemId: e.vcpm.subgraphSystemId,
      vcpmDefinitionId: e.vcpm.vcpmModuleDefinitionId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmInstanceSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'VcpmInstance',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── VcpmCkv ─────────────────────────────────────────────────────────────────

  private async insertVcpmCkvs(subgraphs: Subgraph[]): Promise<RawFailure[]> {
    const ckvEntries = subgraphs
      .filter(s => s.vcpmDataInstance !== null)
      .flatMap(s =>
        s.vcpmDataInstance!.ckvs.map(ckv => ({
          ckv,
          vcpmSystemId: s.vcpmDataInstance!.systemId,
          subgraph: s,
        })),
      );

    if (ckvEntries.length === 0) return [];

    const contextBySystemId = new Map<
      number,
      {readonly ckv: KvData; readonly subgraph: Subgraph}
    >(
      ckvEntries.map(e => [e.ckv.systemId, {ckv: e.ckv, subgraph: e.subgraph}]),
    );

    const rows: InsertRow<VcpmCkvRow>[] = ckvEntries.map(e => ({
      systemId: e.ckv.systemId,
      vcpmInstanceSystemId: e.vcpmSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmCkvSchema,
      rows,
    );

    const failures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'VcpmCkv',
        failedRowJson: `VcpmCkv row: ${JSON.stringify(failedRow)} Parent VcpmInstance: ${JSON.stringify({systemId: ctx.ckv.systemId})}`,
        dbError: error.message,
      };
    });

    const failedIds = new Set(failedEntities.map(e => e.systemId));
    const valueFailures = await this.insertVcpmCkvValues(ckvEntries, failedIds);
    return [...failures, ...valueFailures];
  }

  private async insertVcpmCkvValues(
    ckvEntries: {ckv: KvData; vcpmSystemId: number; subgraph: Subgraph}[],
    failedIds: Set<number>,
  ): Promise<RawFailure[]> {
    const allValueRows: VcpmCkvValuesRow[] = ckvEntries
      .filter(e => !failedIds.has(e.ckv.systemId))
      .flatMap(e =>
        e.ckv.valueDefinitionSystemIds.map(valueId => ({
          vcpmCkvSystemId: e.ckv.systemId,
          valueDefSystemId: valueId,
        })),
      );

    if (allValueRows.length === 0) return [];

    try {
      await this.manager.insert(VcpmCkvValuesSchema, allValueRows);
      return [];
    } catch {
      return this.insertVcpmCkvValuesWithFallback(ckvEntries, failedIds);
    }
  }

  private async insertVcpmCkvValuesWithFallback(
    ckvEntries: {ckv: KvData; vcpmSystemId: number; subgraph: Subgraph}[],
    failedIds: Set<number>,
  ): Promise<RawFailure[]> {
    const failures: RawFailure[] = [];
    for (const entry of ckvEntries) {
      if (failedIds.has(entry.ckv.systemId)) continue;
      if (entry.ckv.valueDefinitionSystemIds.length === 0) continue;

      const valueRows: VcpmCkvValuesRow[] =
        entry.ckv.valueDefinitionSystemIds.map(valueId => ({
          vcpmCkvSystemId: entry.ckv.systemId,
          valueDefSystemId: valueId,
        }));
      try {
        await this.manager.insert(VcpmCkvValuesSchema, valueRows);
      } catch (error) {
        await this.manager.delete('VcpmCkv', {systemId: entry.ckv.systemId});
        failures.push({
          systemId: entry.subgraph.systemId,
          entityLabel: 'VcpmCkv',
          failedRowJson: JSON.stringify({
            vcpmCkvSystemId: entry.ckv.systemId,
            valueRows,
          }),
          dbError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return failures;
  }

  // ─── VcpmParameterPayload ─────────────────────────────────────────────────────

  private async insertVcpmParameterPayloads(
    subgraphs: Subgraph[],
  ): Promise<RawFailure[]> {
    const paramEntries = subgraphs
      .filter(s => s.vcpmDataInstance !== null)
      .flatMap(s =>
        s.vcpmDataInstance!.ckvs.flatMap(ckv =>
          ckv.parameterPayloads.map(param => ({param, ckv, subgraph: s})),
        ),
      );

    if (paramEntries.length === 0) return [];

    // Generate a unique systemId for each VcpmParameterPayload row
    const fileId = subgraphs[0].fileSystemId;
    const rows: InsertRow<VcpmParameterPayloadRow>[] = [];
    const contextBySystemId = new Map<
      number,
      {readonly ckv: KvData; readonly subgraph: Subgraph}
    >();

    for (const entry of paramEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        vcpmParameterSystemId: entry.param.paramDefintionSystemId,
        vcpmCkvSystemId: entry.ckv.systemId,
        payload: entry.param.getPayloadCopy()!,
      });
      contextBySystemId.set(systemId, {
        ckv: entry.ckv,
        subgraph: entry.subgraph,
      });
    }

    const vcpmCkvBySystemId = new Map<number, KvData>(
      subgraphs
        .filter(s => s.vcpmDataInstance !== null)
        .flatMap(s => s.vcpmDataInstance!.ckvs.map(ckv => [ckv.systemId, ckv])),
    );

    const {failedEntities} =
      await BatchInserter.insert<VcpmParameterPayloadRow>(
        this.manager,
        'VcpmParameterPayload',
        rows,
      );

    return failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      const parentCkv =
        failedRow && typeof failedRow.vcpmCkvSystemId === 'number'
          ? vcpmCkvBySystemId.get(failedRow.vcpmCkvSystemId)
          : undefined;
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'VcpmParameterPayload',
        failedRowJson: `VcpmParameterPayload row: ${JSON.stringify(failedRow)}\nParent VcpmCkv: ${JSON.stringify(parentCkv)}`,
        dbError: error.message,
      };
    });
  }
}
