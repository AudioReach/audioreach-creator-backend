/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  SpfModule,
  BulkInsertResult,
  DataPort,
  ControlPort,
  TagData,
  KvData,
  IdGenerationPort,
  ModuleParameterData,
} from '@arc/core';
import {okBulkInsert} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  BatchInserterWithoutRetry,
  type InsertRow,
  type RawFailure,
} from '../common/batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {emptyStepResult} from '../common/step-result.js';
import type {StepResult} from '../common/step-result.js';
import {
  NodeSchema,
  NODE_TYPE,
  type NodeRow,
} from '../../../entity-schema/usecase-data/node/node.schema.js';
import {DataPortSchema} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {DataPortRow} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import {
  ControlPortSchema,
  IntentSchema,
} from '../../../entity-schema/usecase-data/node/control-port.js';
import type {
  ControlPortRow,
  IntentRow,
} from '../../../entity-schema/usecase-data/node/control-port.js';
import {SpfModuleSchema} from '../../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {SpfModuleRow} from '../../../entity-schema/usecase-data/module/spf-module.schema.js';
import {
  ModuleTagIdMapSchema,
  TkvValuesSchema,
} from '../../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvParameterPayloadRow,
  TkvValuesRow,
} from '../../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
  CkvValuesRow,
} from '../../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import {CkvValuesSchema} from '../../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';

type CkvParameterPayloadInsertRow = InsertRow<CkvParameterPayloadRow> & {
  readonly ckvSystemId: number;
};

type CkvContext = {readonly ckv: KvData; readonly module: SpfModule};

type CkvRemovalResult = {
  readonly ckvSystemId: number;
  readonly rawFailure: RawFailure;
};

/** CKV value failures and parent CKVs that later steps must skip. */
type CkvValueInsertResult = {
  readonly rawFailures: RawFailure[];
  readonly failedCkvIds: Set<number>;
};

export class SpfModuleInserter implements BulkInserter<SpfModule> {
  private readonly manager: EntityManager;
  private readonly idGeneration: IdGenerationPort;

  constructor(manager: EntityManager, idGeneration: IdGenerationPort) {
    this.manager = manager;
    this.idGeneration = idGeneration;
  }

  public async insert(modules: SpfModule[]): Promise<BulkInsertResult> {
    if (modules.length === 0) return okBulkInsert();

    const moduleBySystemId = new Map(modules.map(m => [m.systemId, m]));

    const nodeStep = await this.insertNodes(modules);
    const activeModules = modules.filter(
      m => !nodeStep.failedEntityIds.has(m.systemId),
    );

    const [dataPortsStep, controlPortsStep, spfModulesStep] = await Promise.all(
      [
        this.insertDataPorts(activeModules),
        this.insertControlPorts(activeModules),
        this.insertSpfModules(activeModules),
      ],
    );

    const intentsStep = await this.insertIntents(
      activeModules,
      controlPortsStep.failedEntityIds,
    );

    const activeSpfModules = activeModules.filter(
      m => !spfModulesStep.failedEntityIds.has(m.systemId),
    );

    const [tagIdMapsStep, ckvStep] = await Promise.all([
      this.insertModuleTagIdMaps(activeSpfModules),
      this.insertCkvs(activeSpfModules),
    ]);

    const [tkvStep, ckvParamStep] = await Promise.all([
      this.insertTkvs(activeSpfModules, tagIdMapsStep.failedEntityIds),
      this.insertCkvParameterPayloads(
        activeSpfModules,
        ckvStep.failedEntityIds,
      ),
    ]);

    const tkvParamStep = await this.insertTkvParameterPayloads(
      activeSpfModules,
      tagIdMapsStep.failedEntityIds,
      tkvStep.failedEntityIds,
    );

    const allRawFailures: RawFailure[] = [
      ...nodeStep.rawFailures,
      ...dataPortsStep.rawFailures,
      ...controlPortsStep.rawFailures,
      ...spfModulesStep.rawFailures,
      ...intentsStep.rawFailures,
      ...tagIdMapsStep.rawFailures,
      ...ckvStep.rawFailures,
      ...tkvStep.rawFailures,
      ...ckvParamStep.rawFailures,
      ...tkvParamStep.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      moduleBySystemId,
      m =>
        `some or all data belonging to Spf Module {instanceId=${m.naturalId}, systemId=${m.systemId}}`,
    );
  }

  // ─── Node ────────────────────────────────────────────────────────────────────

  private async insertNodes(modules: SpfModule[]): Promise<StepResult> {
    const rows: InsertRow<NodeRow>[] = modules.map(m => ({
      systemId: m.systemId,
      parentSystemId: m.parentSystemId,
      type: NODE_TYPE.Module,
      fileSystemId: m.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      NodeSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: module.systemId,
        entityLabel: 'Module-Node',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Data Port ───────────────────────────────────────────────────────────────

  private async insertDataPorts(modules: SpfModule[]): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: DataPort; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.dataPorts.map(port => [port.systemId, {port, module: m}] as const),
      ),
    );

    const rows: InsertRow<DataPortRow>[] = modules.flatMap(m =>
      m.dataPorts.map(port => ({
        systemId: port.systemId,
        naturalId: port.naturalId,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: m.systemId,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Data Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Control Port ────────────────────────────────────────────────────────────

  private async insertControlPorts(modules: SpfModule[]): Promise<StepResult> {
    const contextByPortSystemId = new Map<
      number,
      {readonly port: ControlPort; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.controlPorts.map(port => [port.systemId, {port, module: m}] as const),
      ),
    );

    const rows: InsertRow<ControlPortRow>[] = modules.flatMap(m =>
      m.controlPorts.map(port => ({
        systemId: port.systemId,
        naturalId: port.naturalId,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: m.systemId,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ControlPortSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Control Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Intent ──────────────────────────────────────────────────────────────────

  private async insertIntents(
    modules: SpfModule[],
    failedPortIds: Set<number>,
  ): Promise<StepResult> {
    const intentEntries = modules.flatMap(m =>
      m.controlPorts
        .filter(port => !failedPortIds.has(port.systemId))
        .flatMap(port =>
          port.intentIds.map(intentNaturalId => ({
            intentNaturalId,
            controlPortSystemId: port.systemId,
            port,
            module: m,
          })),
        ),
    );

    if (intentEntries.length === 0) return emptyStepResult();

    const fileId = modules[0].fileSystemId;
    const rows: InsertRow<IntentRow>[] = [];
    const contextBySystemId = new Map<
      number,
      {readonly port: ControlPort; readonly module: SpfModule}
    >();

    for (const entry of intentEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        naturalId: entry.intentNaturalId,
        controlPortSystemId: entry.controlPortSystemId,
      });
      contextBySystemId.set(systemId, {port: entry.port, module: entry.module});
    }

    const {failedEntities} = await BatchInserter.insert<IntentRow>(
      this.manager,
      IntentSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Intent',
        failedRowJson: `Intent row: ${JSON.stringify(failedRow)} Control Port: ${JSON.stringify({systemId: ctx.port.systemId, portNaturalId: ctx.port.naturalId})}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Spf Module ──────────────────────────────────────────────────────────────

  private async insertSpfModules(modules: SpfModule[]): Promise<StepResult> {
    const rows: InsertRow<SpfModuleRow>[] = modules.map(m => ({
      systemId: m.systemId,
      naturalId: m.naturalId,
      alias: m.alias ?? null,
      subgraphSystemId: m.subgraphSystemId,
      containerSystemId: m.containerSystemId,
      definitionSystemId: m.definitionSystemId,
      fileSystemId: m.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SpfModuleSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: module.systemId,
        entityLabel: 'Spf Module',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── Module Tag ──────────────────────────────────────────────────────────────

  private async insertModuleTagIdMaps(
    modules: SpfModule[],
  ): Promise<StepResult> {
    const contextByTagSystemId = new Map<
      number,
      {readonly tagData: TagData; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.tagDataList.map(
          tagData => [tagData.systemId, {tagData, module: m}] as const,
        ),
      ),
    );

    const rows: InsertRow<ModuleTagIdMapRow>[] = modules.flatMap(m =>
      m.tagDataList.map(tagData => ({
        systemId: tagData.systemId,
        spfModuleSystemId: m.systemId,
        tagDefinitionSystemId: tagData.tagDefinitionSystemId,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ModuleTagIdMapSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByTagSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Module Tag',
        failedRowJson: `Module Tag row: ${JSON.stringify(failedRow)} Tag Definition: ${JSON.stringify({tagDefinitionSystemId: ctx.tagData.tagDefinitionSystemId})}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  // ─── CKV ─────────────────────────────────────────────────────────────────────

  private async insertCkvs(modules: SpfModule[]): Promise<StepResult> {
    const contextByCkvSystemId = new Map<
      number,
      {readonly ckv: KvData; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.ckvs.map(ckv => [ckv.systemId, {ckv, module: m}] as const),
      ),
    );

    const rows: InsertRow<CkvRow>[] = modules.flatMap(m =>
      m.ckvs.map(ckv => ({
        systemId: ckv.systemId,
        spfModuleSystemId: m.systemId,
        uiPersistence: ckv.uiPersistence,
      })),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert<CkvRow>(
      this.manager,
      'Ckv',
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByCkvSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'CKV',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    const failedCkvIds = new Set(failedEntities.map(e => e.systemId));
    const valueResult = await this.insertCkvValues(
      modules,
      failedCkvIds,
      contextByCkvSystemId,
    );
    // valueResult.failedCkvIds — CKV system IDs whose value inserts failed and whose
    // parent CKV was deleted. Merged here so the combined skip-set covers both CKV row
    // failures and CKV value failures before being passed to insertCkvParameterPayloads.
    for (const failedCkvId of valueResult.failedCkvIds) {
      failedCkvIds.add(failedCkvId);
    }

    return {
      rawFailures: [...rawFailures, ...valueResult.rawFailures],
      // failedEntityIds: CKV system IDs (row failures + value failures). Consumed by
      // insertCkvParameterPayloads to skip payload inserts for deleted CKVs.
      failedEntityIds: failedCkvIds,
    };
  }

  /**
   * Inserts all CKV-to-value associations in SQLite-safe batches derived from
   * TypeORM metadata. The shared inserter reports only successful batches, so
   * this method derives the uninserted rows from the original row references.
   *
   * The caller-owned recovery path retries each uninserted value row
   * individually. Its first database error deletes the parent CKV once, so
   * its FK cascade removes values that succeeded in earlier batches while
   * valid sibling CKVs remain persisted.
   */
  private async insertCkvValues(
    modules: SpfModule[],
    failedCkvIds: Set<number>,
    context: Map<number, CkvContext>,
  ): Promise<CkvValueInsertResult> {
    const rows = await this.createCkvValueRows(modules, failedCkvIds);

    if (rows.length === 0) {
      return {rawFailures: [], failedCkvIds: new Set()};
    }

    const {failedRows} = await BatchInserterWithoutRetry.insert(
      this.manager,
      CkvValuesSchema,
      rows,
    );
    if (failedRows.length === 0) {
      return {rawFailures: [], failedCkvIds: new Set()};
    }

    return this.retryCkvValueRows(context, failedRows);
  }

  /** Creates CKV-owned association rows for the first-pass batch insert. */
  private async createCkvValueRows(
    modules: SpfModule[],
    failedCkvIds: ReadonlySet<number>,
  ): Promise<CkvValuesRow[]> {
    const rows: CkvValuesRow[] = [];
    for (const module of modules) {
      for (const ckv of module.ckvs) {
        if (failedCkvIds.has(ckv.systemId)) continue;
        for (const valueDefSystemId of ckv.valueDefinitionSystemIds) {
          rows.push({
            systemId: await this.idGeneration.getNextId(module.fileSystemId),
            ckvSystemId: ckv.systemId,
            valueDefSystemId,
          });
        }
      }
    }
    return rows;
  }

  /**
   * Recovers rows not present in first-pass results one CKV at a time. Each
   * child row is retried individually to capture the actual database error.
   */
  private async retryCkvValueRows(
    context: Map<number, CkvContext>,
    uninsertedRows: readonly CkvValuesRow[],
  ): Promise<CkvValueInsertResult> {
    const rawFailures: RawFailure[] = [];
    const failedCkvIds = new Set<number>();
    const rowsByCkvSystemId = this.groupRowsByCkvSystemId(uninsertedRows);
    for (const [ckvSystemId, ckvRows] of rowsByCkvSystemId) {
      for (const row of ckvRows) {
        try {
          await this.manager.insert(CkvValuesSchema, row);
        } catch (error) {
          const {ckvSystemId: failedId, rawFailure} =
            await this.removeFailedCkv(
              context,
              ckvSystemId,
              {ckvSystemId, valueRows: ckvRows},
              error,
            );
          rawFailures.push(rawFailure);
          // failedCkvIds carries CKV system IDs — the direct parent of ckv_values rows.
          // Collected by insertCkvs and forwarded to insertCkvParameterPayloads to skip
          // payload inserts for any CKV whose values could not be persisted.
          failedCkvIds.add(failedId);
          break;
        }
      }
    }
    return {rawFailures, failedCkvIds};
  }

  /**
   * Removes a CKV after a child-row fallback failed and returns the CKV system
   * ID alongside the failure record so callers can reliably propagate it to the
   * next step's skip-set. The FK cascade cleans up values and payloads that may
   * have been inserted in earlier batches. The delete is best-effort: if it
   * throws the CKV is still returned as failed so downstream steps skip it.
   */
  private async removeFailedCkv(
    context: Map<number, CkvContext>,
    ckvSystemId: number,
    failedRow: unknown,
    error: unknown,
  ): Promise<CkvRemovalResult> {
    const {module} = context.get(ckvSystemId)!;
    try {
      await this.manager.delete('Ckv', {systemId: ckvSystemId});
    } catch {
      // best-effort cleanup; CKV is already considered failed
    }
    return {
      ckvSystemId,
      rawFailure: {
        systemId: module.systemId,
        entityLabel: 'CKV',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error instanceof Error ? error.message : String(error),
      },
    };
  }

  private groupRowsByCkvSystemId<TRow extends {readonly ckvSystemId: number}>(
    rows: readonly TRow[],
  ): Map<number, TRow[]> {
    const rowsByCkvSystemId = new Map<number, TRow[]>();
    for (const row of rows) {
      const ckvRows = rowsByCkvSystemId.get(row.ckvSystemId) ?? [];
      ckvRows.push(row);
      rowsByCkvSystemId.set(row.ckvSystemId, ckvRows);
    }
    return rowsByCkvSystemId;
  }

  // ─── TKV ─────────────────────────────────────────────────────────────────────

  private async insertTkvs(
    modules: SpfModule[],
    failedTagIds: Set<number>,
  ): Promise<StepResult> {
    const contextByTkvSystemId = new Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >(
      modules.flatMap(m =>
        m.tagDataList
          .filter(tagData => !failedTagIds.has(tagData.systemId))
          .flatMap(tagData =>
            tagData.tkvs.map(
              tkv => [tkv.systemId, {tkv, tagData, module: m}] as const,
            ),
          ),
      ),
    );

    const rows: InsertRow<TkvRow>[] = modules.flatMap(m =>
      m.tagDataList
        .filter(tagData => !failedTagIds.has(tagData.systemId))
        .flatMap(tagData =>
          tagData.tkvs.map(tkv => ({
            systemId: tkv.systemId,
            moduleTagIdMapSystemId: tagData.systemId,
            uiPersistence: tkv.uiPersistence,
          })),
        ),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert<TkvRow>(
      this.manager,
      'Tkv',
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextByTkvSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'TKV',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });

    const failedTkvIds = new Set(failedEntities.map(e => e.systemId));
    const valueStep = await this.collectTkvValueRows(
      modules,
      failedTkvIds,
      failedTagIds,
      contextByTkvSystemId,
    );

    return {
      rawFailures: [...rawFailures, ...valueStep.rawFailures],
      // failedEntityIds: TKV system IDs (row failures + value failures from retryTkvValueRows).
      // Consumed by insertTkvParameterPayloads to skip payload inserts for deleted TKVs.
      failedEntityIds: new Set([...failedTkvIds, ...valueStep.failedEntityIds]),
    };
  }

  private async collectTkvValueRows(
    modules: SpfModule[],
    failedTkvIds: Set<number>,
    failedTagIds: Set<number>,
    context: Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >,
  ): Promise<StepResult> {
    const allValueRows: TkvValuesRow[] = [];
    for (const module of modules) {
      for (const tagData of module.tagDataList) {
        if (failedTagIds.has(tagData.systemId)) continue;
        for (const tkv of tagData.tkvs) {
          if (failedTkvIds.has(tkv.systemId)) continue;
          const rows = await this.createTkvValueRows(tkv, module.fileSystemId);
          allValueRows.push(...rows);
        }
      }
    }

    if (allValueRows.length === 0) return emptyStepResult();

    const {failedRows} = await BatchInserterWithoutRetry.insert(
      this.manager,
      TkvValuesSchema,
      allValueRows,
    );
    if (failedRows.length === 0) return emptyStepResult();

    return this.retryTkvValueRows(context, failedRows);
  }

  private async createTkvValueRows(
    tkv: KvData,
    fileSystemId: number,
  ): Promise<TkvValuesRow[]> {
    const rows: TkvValuesRow[] = [];
    for (const valueDefSystemId of tkv.valueDefinitionSystemIds) {
      rows.push({
        systemId: await this.idGeneration.getNextId(fileSystemId),
        tkvSystemId: tkv.systemId,
        valueDefSystemId,
      });
    }
    return rows;
  }

  private async retryTkvValueRows(
    context: Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >,
    uninsertedRows: readonly TkvValuesRow[],
  ): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];
    const failedEntityIds = new Set<number>();

    const rowsByTkvSystemId = new Map<number, TkvValuesRow[]>();
    for (const row of uninsertedRows) {
      const tkvRows = rowsByTkvSystemId.get(row.tkvSystemId) ?? [];
      tkvRows.push(row);
      rowsByTkvSystemId.set(row.tkvSystemId, tkvRows);
    }

    for (const [tkvSystemId, tkvRows] of rowsByTkvSystemId) {
      for (const row of tkvRows) {
        try {
          await this.manager.insert(TkvValuesSchema, row);
        } catch (error) {
          const {module} = context.get(tkvSystemId)!;
          // failedEntityIds carries TKV system IDs — the direct parent of tkv_values rows.
          // Merged into insertTkvs.failedEntityIds and forwarded to insertTkvParameterPayloads
          // to skip payload inserts for any TKV whose values could not be persisted.
          failedEntityIds.add(tkvSystemId);
          try {
            await this.manager.delete('Tkv', {systemId: tkvSystemId});
          } catch {
            // best-effort cleanup; TKV is already considered failed
          }
          rawFailures.push({
            systemId: module.systemId,
            entityLabel: 'TKV',
            failedRowJson: JSON.stringify({tkvSystemId, tkvRows}),
            dbError: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }
    }

    return {rawFailures, failedEntityIds};
  }

  // ─── CKV Parameter ───────────────────────────────────────────────────────────

  private async insertCkvParameterPayloads(
    modules: SpfModule[],
    failedCkvIds: Set<number>,
  ): Promise<StepResult> {
    const paramEntries = modules.flatMap(m =>
      m.ckvs
        .filter(ckv => !failedCkvIds.has(ckv.systemId))
        .flatMap(ckv =>
          ckv.parameterPayloads.map(param => ({param, ckv, module: m})),
        ),
    );

    if (paramEntries.length === 0) return emptyStepResult();

    const fileId = modules[0].fileSystemId;
    const rows: CkvParameterPayloadInsertRow[] = [];
    const contextByCkvSystemId = new Map<number, CkvContext>();

    for (const entry of paramEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      const row: CkvParameterPayloadInsertRow = {
        systemId,
        parameterSystemId: entry.param.paramDefintionSystemId,
        ckvSystemId: entry.ckv.systemId,
        payload: entry.param.getPayloadCopy(),
      };
      rows.push(row);
      contextByCkvSystemId.set(entry.ckv.systemId, {
        ckv: entry.ckv,
        module: entry.module,
      });
    }

    const {failedRows} = await BatchInserterWithoutRetry.insert(
      this.manager,
      'CkvParameterPayload',
      rows,
    );
    if (failedRows.length === 0) return emptyStepResult();

    return this.retryCkvPayloadRows(contextByCkvSystemId, failedRows);
  }

  /** Retries each uninserted CKV parameter payload row independently. */
  private async retryCkvPayloadRows(
    context: Map<number, CkvContext>,
    uninsertedRows: readonly CkvParameterPayloadInsertRow[],
  ): Promise<StepResult> {
    const rawFailures: RawFailure[] = [];
    const failedCkvIds = new Set<number>();
    const rowsByCkvSystemId = this.groupRowsByCkvSystemId(uninsertedRows);
    for (const [ckvSystemId, ckvRows] of rowsByCkvSystemId) {
      for (const row of ckvRows) {
        try {
          await this.manager.insert('CkvParameterPayload', row);
        } catch (error) {
          const {ckvSystemId: failedId, rawFailure} =
            await this.removeFailedCkv(
              context,
              ckvSystemId,
              {ckvSystemId, payloadRows: ckvRows},
              error,
            );
          rawFailures.push(rawFailure);
          // failedCkvIds carries CKV system IDs — the direct parent of ckv_parameter_payload rows.
          // Returned as failedEntityIds so callers can extend the CKV skip-set if needed.
          failedCkvIds.add(failedId);
          break;
        }
      }
    }
    return {rawFailures, failedEntityIds: failedCkvIds};
  }

  // ─── TKV Parameter ───────────────────────────────────────────────────────────

  private buildTkvParamEntriesForTagData(
    m: SpfModule,
    tagData: TagData,
    failedTkvIds: Set<number>,
  ): {
    param: ModuleParameterData;
    tkv: KvData;
    tagData: TagData;
    module: SpfModule;
  }[] {
    return tagData.tkvs
      .filter(tkv => !failedTkvIds.has(tkv.systemId))
      .flatMap(tkv =>
        tkv.parameterPayloads.map(param => ({param, tkv, tagData, module: m})),
      );
  }

  private buildTkvParamEntries(
    modules: SpfModule[],
    failedTagIds: Set<number>,
    failedTkvIds: Set<number>,
  ): {
    param: ModuleParameterData;
    tkv: KvData;
    tagData: TagData;
    module: SpfModule;
  }[] {
    return modules.flatMap(m =>
      m.tagDataList
        .filter(tagData => !failedTagIds.has(tagData.systemId))
        .flatMap(tagData =>
          this.buildTkvParamEntriesForTagData(m, tagData, failedTkvIds),
        ),
    );
  }

  private async insertTkvParameterPayloads(
    modules: SpfModule[],
    failedTagIds: Set<number>,
    failedTkvIds: Set<number>,
  ): Promise<StepResult> {
    const paramEntries = this.buildTkvParamEntries(
      modules,
      failedTagIds,
      failedTkvIds,
    );

    if (paramEntries.length === 0) return emptyStepResult();

    const fileId = modules[0].fileSystemId;
    const rows: InsertRow<TkvParameterPayloadRow>[] = [];
    const contextBySystemId = new Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >();

    for (const entry of paramEntries) {
      const systemId = await this.idGeneration.getNextId(fileId);
      rows.push({
        systemId,
        parameterSystemId: entry.param.paramDefintionSystemId,
        tkvSystemId: entry.tkv.systemId,
        payload: entry.param.getPayloadCopy(),
      });
      contextBySystemId.set(systemId, {
        tkv: entry.tkv,
        tagData: entry.tagData,
        module: entry.module,
      });
    }

    const tkvBySystemId = new Map<number, KvData>(
      modules.flatMap(m =>
        m.tagDataList.flatMap(tagData =>
          tagData.tkvs.map(tkv => [tkv.systemId, tkv] as const),
        ),
      ),
    );

    const {failedEntities} = await BatchInserter.insert<TkvParameterPayloadRow>(
      this.manager,
      'TkvParameterPayload',
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      const parentTkv =
        failedRow && typeof failedRow.tkvSystemId === 'number'
          ? tkvBySystemId.get(failedRow.tkvSystemId)
          : undefined;
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'TKV Parameter',
        failedRowJson: `Tkv parameter row: ${JSON.stringify(failedRow)}\nParent Tkv:${JSON.stringify(parentTkv)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
