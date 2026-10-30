/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  Subgraph,
  BulkInsertResult,
  KvData,
  IdGenerationPort,
  Sgkv,
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
import {
  SgkvSchema,
  SgkvValuesSchema,
  type SgkvRow,
  type SgkvValuesRow,
} from '../../../entity-schema/usecase-data/subgraph/subgraph-sgkv-data.js';
import type {EntityRowForInsert} from '../../../entity-schema/entity-base.js';

type SgkvValueInsertRow = EntityRowForInsert<SgkvValuesRow>;
type VcpmCkvValueInsertRow = EntityRowForInsert<VcpmCkvValuesRow>;

export class SubgraphInserter implements BulkInserter<Subgraph> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  public async insert(subgraphs: Subgraph[]): Promise<BulkInsertResult> {
    if (subgraphs.length === 0) return okBulkInsert();

    const subgraphBySystemId = new Map(subgraphs.map(s => [s.systemId, s]));

    const subgraphStep = await this.insertSubgraphs(subgraphs);
    const activeSubgraphs = subgraphs.filter(
      s => !subgraphStep.failedEntityIds.has(s.systemId),
    );

    const [propertyDataStep, vcpmInstanceStep] = await Promise.all([
      this.insertSubgraphPropertyData(activeSubgraphs),
      this.insertVcpmInstances(activeSubgraphs),
    ]);

    const vcpmCkvStep = await this.insertVcpmCkvs(
      activeSubgraphs,
      vcpmInstanceStep.failedEntityIds,
    );

    const vcpmParamStep = await this.insertVcpmParameterPayloads(
      activeSubgraphs,
      vcpmInstanceStep.failedEntityIds,
      vcpmCkvStep.failedEntityIds,
    );

    const sgkvStep = await this.insertSgkvs(activeSubgraphs);
    // skip-set contains SGKV-level systemIds; subgraphs with one failed SGKV
    // can still have their other SGKVs' values inserted
    const sgkvValStep = await this.insertSgkvValues(
      activeSubgraphs,
      sgkvStep.failedEntityIds,
    );

    const allRawFailures: RawFailure[] = [
      ...subgraphStep.rawFailures,
      ...propertyDataStep.rawFailures,
      ...vcpmInstanceStep.rawFailures,
      ...vcpmCkvStep.rawFailures,
      ...vcpmParamStep.rawFailures,
      ...sgkvStep.rawFailures,
      ...sgkvValStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      subgraphBySystemId,
      s =>
        `some or all data belonging to Subgraph {subgraphId=${s.naturalId}, systemId=${s.systemId}}`,
    );
  }

  // ─── Subgraph ─────────────────────────────────────────────────────────────────

  private async insertSubgraphs(subgraphs: Subgraph[]): Promise<StepResult> {
    const rows: InsertRow<SubgraphRow>[] = subgraphs.map(s => ({
      systemId: s.systemId,
      naturalId: s.naturalId,
      name: s.name,
      isImported: s.isImported,
      fileSystemId: s.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubgraphSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const subgraph = subgraphs.find(s => s.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: subgraph.systemId,
        entityLabel: 'Subgraph',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Subgraph Property Data ───────────────────────────────────────────────────

  private async insertSubgraphPropertyData(
    subgraphs: Subgraph[],
  ): Promise<StepResult> {
    const propEntries = subgraphs.flatMap(s =>
      s.properties.map(prop => ({prop, subgraph: s})),
    );

    if (propEntries.length === 0) return emptyStepResult();

    const rows: InsertRow<SubgraphPropertyDataRow>[] = [];
    const contextBySystemId = new Map<number, {readonly subgraph: Subgraph}>();

    for (const entry of propEntries) {
      const systemId = entry.prop.systemId;
      rows.push({
        systemId,
        subgraphSystemId: entry.subgraph.systemId,
        propertySystemId: entry.prop.propertyDefinitionSystemId,
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

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'Subgraph Property Data',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── VcpmInstance ─────────────────────────────────────────────────────────────

  private async insertVcpmInstances(
    subgraphs: Subgraph[],
  ): Promise<StepResult> {
    const vcpmEntries = subgraphs
      .filter(s => s.vcpmDataInstance !== null)
      .map(s => ({vcpm: s.vcpmDataInstance!, subgraph: s}));

    if (vcpmEntries.length === 0) return emptyStepResult();

    const contextBySystemId = new Map<number, {readonly subgraph: Subgraph}>(
      vcpmEntries.map(e => [e.vcpm.systemId, {subgraph: e.subgraph}]),
    );

    const rows: InsertRow<VcpmInstanceRow>[] = vcpmEntries.map(e => ({
      systemId: e.vcpm.systemId,
      subgraphSystemId: e.vcpm.subgraphSystemId,
      ['vcpmDefinitionId']: e.vcpm.vcpmModuleDefinitionSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmInstanceSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'VcpmInstance',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── VcpmCkv ─────────────────────────────────────────────────────────────────

  private async insertVcpmCkvs(
    subgraphs: Subgraph[],
    failedVcpmInstanceIds: Set<number>,
  ): Promise<StepResult> {
    const ckvEntries = subgraphs
      .filter(
        s =>
          s.vcpmDataInstance !== null &&
          !failedVcpmInstanceIds.has(s.vcpmDataInstance.systemId),
      )
      .flatMap(s =>
        s.vcpmDataInstance!.ckvs.map(ckv => ({
          ckv,
          vcpmSystemId: s.vcpmDataInstance!.systemId,
          subgraph: s,
        })),
      );

    if (ckvEntries.length === 0) return emptyStepResult();

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

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'VcpmCkv',
        failedRowJson: `VcpmCkv row: ${JSON.stringify(failedRow)} Parent VcpmInstance: ${JSON.stringify({systemId: ctx.ckv.systemId})}`,
        dbError: error.message,
      };
    });

    const failedCkvIds = new Set(failedEntities.map(e => e.systemId));
    const valueFailures = await this.insertVcpmCkvValues(
      ckvEntries,
      failedCkvIds,
    );

    return {
      rawFailures: [...rawFailures, ...valueFailures],
      failedEntityIds: failedCkvIds,
    };
  }

  private async insertVcpmCkvValues(
    ckvEntries: {ckv: KvData; vcpmSystemId: number; subgraph: Subgraph}[],
    failedIds: Set<number>,
  ): Promise<RawFailure[]> {
    const allValueRows: VcpmCkvValueInsertRow[] = [];
    const rowsByCkvSystemId = new Map<number, VcpmCkvValueInsertRow[]>();
    for (const entry of ckvEntries) {
      if (failedIds.has(entry.ckv.systemId)) continue;
      const valueRows: VcpmCkvValueInsertRow[] = [];
      for (const valueDefSystemId of entry.ckv.valueDefinitionSystemIds) {
        valueRows.push({
          systemId: await this.idGeneration.getNextId(
            entry.subgraph.fileSystemId,
          ),
          vcpmCkvSystemId: entry.ckv.systemId,
          valueDefSystemId,
        });
      }
      rowsByCkvSystemId.set(entry.ckv.systemId, valueRows);
      allValueRows.push(...valueRows);
    }

    if (allValueRows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert<VcpmCkvValuesRow>(
      this.manager,
      VcpmCkvValuesSchema,
      allValueRows,
    );
    const valueRowBySystemId = new Map(
      allValueRows.map(row => [row.systemId, row] as const),
    );
    const failureByCkvSystemId = new Map<number, string>();

    for (const failure of failedEntities) {
      const row = valueRowBySystemId.get(failure.systemId);
      if (row !== undefined) {
        failureByCkvSystemId.set(row.vcpmCkvSystemId, failure.message);
      }
    }

    const entryByCkvSystemId = new Map(
      ckvEntries.map(entry => [entry.ckv.systemId, entry] as const),
    );
    const failures: RawFailure[] = [];
    for (const [ckvSystemId, dbError] of failureByCkvSystemId) {
      const entry = entryByCkvSystemId.get(ckvSystemId)!;
      failedIds.add(ckvSystemId);
      await this.manager.delete('VcpmCkv', {systemId: ckvSystemId});
      failures.push({
        systemId: entry.subgraph.systemId,
        entityLabel: 'VcpmCkv',
        failedRowJson: JSON.stringify({
          vcpmCkvSystemId: ckvSystemId,
          valueRows: rowsByCkvSystemId.get(ckvSystemId) ?? [],
        }),
        dbError,
      });
    }
    return failures;
  }

  // ─── VcpmParameterPayload ─────────────────────────────────────────────────────

  private async insertVcpmParameterPayloads(
    subgraphs: Subgraph[],
    failedVcpmInstanceIds: Set<number>,
    failedCkvIds: Set<number>,
  ): Promise<StepResult> {
    const paramEntries = subgraphs
      .filter(
        s =>
          s.vcpmDataInstance !== null &&
          !failedVcpmInstanceIds.has(s.vcpmDataInstance.systemId),
      )
      .flatMap(s =>
        s
          .vcpmDataInstance!.ckvs.filter(ckv => !failedCkvIds.has(ckv.systemId))
          .flatMap(ckv =>
            ckv.parameterPayloads.map(param => ({param, ckv, subgraph: s})),
          ),
      );

    if (paramEntries.length === 0) return emptyStepResult();

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
        payload: entry.param.getPayloadCopy(),
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

    const rawFailures: RawFailure[] = failedEntities.map(error => {
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

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Sgkv ─────────────────────────────────────────────────────────────────────

  private async insertSgkvs(subgraphs: Subgraph[]): Promise<StepResult> {
    const sgkvEntries = subgraphs.flatMap(s =>
      s.sgkvs.map(sgkv => ({sgkv, subgraph: s})),
    );

    if (sgkvEntries.length === 0) return emptyStepResult();

    const contextBySystemId = new Map<
      number,
      {readonly sgkv: Sgkv; readonly subgraph: Subgraph}
    >(
      sgkvEntries.map(e => [
        e.sgkv.systemId,
        {sgkv: e.sgkv, subgraph: e.subgraph},
      ]),
    );

    const rows: InsertRow<SgkvRow>[] = sgkvEntries.map(e => ({
      systemId: e.sgkv.systemId,
      subgraphSystemId: e.subgraph.systemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SgkvSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.subgraph.systemId,
        entityLabel: 'Sgkv',
        failedRowJson: `(subgraphId=${BinaryUtils.toHexString(ctx.subgraph.naturalId)}) Row: ${JSON.stringify(failedRow)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertSgkvValues(
    subgraphs: Subgraph[],
    failedSgkvIds: Set<number>,
  ): Promise<StepResult> {
    const sgkvEntries = subgraphs.flatMap(s =>
      s.sgkvs
        .filter(sgkv => !failedSgkvIds.has(sgkv.systemId))
        .map(sgkv => ({sgkv, subgraph: s})),
    );

    const allValueRows: SgkvValueInsertRow[] = [];
    const rowsBySgkvSystemId = new Map<number, SgkvValueInsertRow[]>();
    for (const entry of sgkvEntries) {
      const valueRows: SgkvValueInsertRow[] = [];
      for (const valueDefSystemId of entry.sgkv.valueDefinitionSystemIds) {
        valueRows.push({
          systemId: await this.idGeneration.getNextId(
            entry.subgraph.fileSystemId,
          ),
          sgkvSystemId: entry.sgkv.systemId,
          valueDefSystemId,
        });
      }
      rowsBySgkvSystemId.set(entry.sgkv.systemId, valueRows);
      allValueRows.push(...valueRows);
    }

    if (allValueRows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert<SgkvValuesRow>(
      this.manager,
      SgkvValuesSchema,
      allValueRows,
    );
    const valueRowBySystemId = new Map(
      allValueRows.map(row => [row.systemId, row] as const),
    );
    const failureBySgkvSystemId = new Map<number, string>();

    for (const failure of failedEntities) {
      const row = valueRowBySystemId.get(failure.systemId);
      if (row !== undefined) {
        failureBySgkvSystemId.set(row.sgkvSystemId, failure.message);
      }
    }

    const entryBySgkvSystemId = new Map(
      sgkvEntries.map(entry => [entry.sgkv.systemId, entry] as const),
    );
    const rawFailures: RawFailure[] = [];
    const failedEntityIds = new Set<number>();

    for (const [sgkvSystemId, dbError] of failureBySgkvSystemId) {
      const entry = entryBySgkvSystemId.get(sgkvSystemId)!;
      await this.manager.delete('Sgkv', {systemId: sgkvSystemId});
      failedEntityIds.add(sgkvSystemId);
      rawFailures.push({
        systemId: entry.subgraph.systemId,
        entityLabel: 'SgkvValues',
        failedRowJson: `(subgraphId=${BinaryUtils.toHexString(entry.subgraph.naturalId)}, sgkvSystemId=${BinaryUtils.toHexString(sgkvSystemId)}) Row: ${JSON.stringify(rowsBySgkvSystemId.get(sgkvSystemId) ?? [])}`,
        dbError,
      });
    }

    return {rawFailures, failedEntityIds};
  }
}
