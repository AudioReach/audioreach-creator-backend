/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  SpfModule,
  BulkInsertError,
  BulkInsertResult,
  DataPort,
  ControlPort,
  TagData,
  KvData,
} from '@arc/core';
import {errBulkInsert, okBulkInsert} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {
  NodeSchema,
  NODE_TYPE,
  type NodeRow,
} from '../../../entity-schema/usecase-data/node/node.schema.js';
import {DataPortSchema} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import type {DataPortRow} from '../../../entity-schema/usecase-data/node/data-port-info.schema.js';
import {ControlPortSchema} from '../../../entity-schema/usecase-data/node/control-port.js';
import type {ControlPortRow} from '../../../entity-schema/usecase-data/node/control-port.js';
import {SpfModuleSchema} from '../../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {SpfModuleRow} from '../../../entity-schema/usecase-data/module/spf-module.schema.js';
import {ModuleTagIdMapSchema} from '../../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvParameterPayloadRow,
} from '../../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
} from '../../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';

/**
 * Inserts SpfModule domain entities and all their children into the database
 * using ordered bulk batch inserts.
 *
 * All insert steps are always attempted regardless of prior failures.
 *
 * Insert order (FK-safe, leaf-first):
 *   Node → Data Port → Control Port → Intent → Spf Module
 *   → Module Tag → CKV → TKV → CKV Parameter → TKV Parameter
 */
export class SpfModuleInserter implements BulkInserter<SpfModule> {
  private readonly manager: EntityManager;

  constructor(manager: EntityManager) {
    this.manager = manager;
  }

  /**
   *  Inserts all SpfModule entities and their children in FK-safe order.
   * Failures are grouped by SpfModule aggregate and returned as
   * `BulkInsertError[]` — one entry per failing module.
   * @returns BulkInsertResult — ok if all inserts succeeded, err otherwise.
   */
  public async insert(modules: SpfModule[]): Promise<BulkInsertResult> {
    if (modules.length === 0) return okBulkInsert();

    const moduleBySystemId = new Map(modules.map(m => [m.systemId, m]));

    // Collect all raw failures from all insert steps.
    const rawFailures: RawFailure[] = [
      ...(await this.insertNodes(modules)),
      ...(await this.insertDataPorts(modules)),
      ...(await this.insertControlPorts(modules)),
      ...(await this.insertIntents(modules)),
      ...(await this.insertSpfModules(modules)),
      ...(await this.insertModuleTagIdMaps(modules)),
      ...(await this.insertCkvs(modules)),
      ...(await this.insertTkvs(modules)),
      ...(await this.insertCkvParameterPayloads(modules)),
      ...(await this.insertTkvParameterPayloads(modules)),
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by SpfModule systemId.
    const grouped = new Map<number, string[]>();
    for (const f of rawFailures) {
      if (!grouped.has(f.systemId)) grouped.set(f.systemId, []);
      grouped
        .get(f.systemId)!
        .push(
          `${f.entityLabel}: Failed to insert\n${f.failedRowJson}\nerror: ${f.dbError}`,
        );
    }

    // Build one BulkInsertError per failing module.
    const errors: BulkInsertError[] = [...grouped.entries()].map(
      ([systemId, lines]) => {
        const module = moduleBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Spf Module {instanceId=${module.instanceId}, systemId=${module.systemId}}`,
          details: lines.join('\n'),
        };
      },
    );

    return errBulkInsert(errors);
  }

  // ─── Node ────────────────────────────────────────────────────────────────────

  private async insertNodes(modules: SpfModule[]): Promise<RawFailure[]> {
    const rows: InsertRow<NodeRow>[] = modules.map(m => ({
      systemId: m.systemId,
      parentId: m.parentId,
      type: NODE_TYPE.Module,
      fileSystemId: m.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      NodeSchema,
      rows,
    );

    return failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: module.systemId,
        entityLabel: 'Module-Node',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Data Port ───────────────────────────────────────────────────────────────

  private async insertDataPorts(modules: SpfModule[]): Promise<RawFailure[]> {
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
        dataPortId: port.dataPortId,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: m.systemId,
      })),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Data Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Control Port ────────────────────────────────────────────────────────────

  private async insertControlPorts(
    modules: SpfModule[],
  ): Promise<RawFailure[]> {
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
        portId: port.portId,
        isStatic: port.isStatic,
        name: port.name,
        nodeSystemId: m.systemId,
      })),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ControlPortSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByPortSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Control Port',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Intent ──────────────────────────────────────────────────────────────────

  private async insertIntents(modules: SpfModule[]): Promise<RawFailure[]> {
    const contextByIntentId = new Map<
      number,
      {readonly port: ControlPort; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.controlPorts.flatMap(port =>
          port.intentSystemIds.map(
            intentId => [intentId, {port, module: m}] as const,
          ),
        ),
      ),
    );

    const rows = modules.flatMap(m =>
      m.controlPorts.flatMap(port =>
        port.intentSystemIds.map(intentId => ({
          intentId,
          controlPortSystemId: port.systemId,
        })),
      ),
    );

    if (rows.length === 0) return [];

    const failures: RawFailure[] = [];

    try {
      await this.manager.insert('Intent', rows);
    } catch {
      for (const row of rows) {
        try {
          await this.manager.insert('Intent', row);
        } catch (rowError: unknown) {
          const message =
            rowError instanceof Error ? rowError.message : String(rowError);
          const ctx = contextByIntentId.get(row.intentId);
          failures.push({
            systemId: ctx?.module.systemId ?? row.controlPortSystemId,
            entityLabel: 'Intent',
            failedRowJson: JSON.stringify(row),
            dbError: message,
          });
        }
      }
    }

    return failures;
  }

  // ─── Spf Module ──────────────────────────────────────────────────────────────

  private async insertSpfModules(modules: SpfModule[]): Promise<RawFailure[]> {
    const rows: InsertRow<SpfModuleRow>[] = modules.map(m => ({
      systemId: m.systemId,
      instanceId: m.instanceId,
      alias: m.alias,
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

    return failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: module.systemId,
        entityLabel: 'Spf Module',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── Module Tag ──────────────────────────────────────────────────────────────

  private async insertModuleTagIdMaps(
    modules: SpfModule[],
  ): Promise<RawFailure[]> {
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
        spfsystemId: m.systemId,
        tagDefinitionSystemId: tagData.tagDefinitionSystemId,
      })),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ModuleTagIdMapSchema,
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByTagSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'Module Tag',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── CKV ─────────────────────────────────────────────────────────────────────

  private async insertCkvs(modules: SpfModule[]): Promise<RawFailure[]> {
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
        spfsystemId: m.systemId,
        keyVectorSystemId: ckv.keyVectorSystemId,
        uiPersistence: ckv.uiPersistence,
      })),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert<CkvRow>(
      this.manager,
      'Ckv',
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByCkvSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'CKV',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── TKV ─────────────────────────────────────────────────────────────────────

  private async insertTkvs(modules: SpfModule[]): Promise<RawFailure[]> {
    const contextByTkvSystemId = new Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >(
      modules.flatMap(m =>
        m.tagDataList.flatMap(tagData =>
          tagData.tkvs.map(
            tkv => [tkv.systemId, {tkv, tagData, module: m}] as const,
          ),
        ),
      ),
    );

    const rows: InsertRow<TkvRow>[] = modules.flatMap(m =>
      m.tagDataList.flatMap(tagData =>
        tagData.tkvs.map(tkv => ({
          systemId: tkv.systemId,
          moduleTagIdMapSystemId: tagData.systemId,
          keyVectorSystemId: tkv.keyVectorSystemId,
          uiPersistence: tkv.uiPersistence,
        })),
      ),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert<TkvRow>(
      this.manager,
      'Tkv',
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByTkvSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'TKV',
        failedRowJson: JSON.stringify(failedRow),
        dbError: error.message,
      };
    });
  }

  // ─── CKV Parameter ───────────────────────────────────────────────────────────

  private async insertCkvParameterPayloads(
    modules: SpfModule[],
  ): Promise<RawFailure[]> {
    const contextByParamSystemId = new Map<
      number,
      {readonly ckv: KvData; readonly module: SpfModule}
    >(
      modules.flatMap(m =>
        m.ckvs.flatMap(ckv =>
          ckv.parameterPayloads.map(
            param => [param.systemId, {ckv, module: m}] as const,
          ),
        ),
      ),
    );

    const ckvBySystemId = new Map<number, KvData>(
      modules.flatMap(m => m.ckvs.map(ckv => [ckv.systemId, ckv] as const)),
    );

    const rows: InsertRow<CkvParameterPayloadRow>[] = modules.flatMap(m =>
      m.ckvs.flatMap(ckv =>
        ckv.parameterPayloads.map(param => ({
          systemId: param.systemId,
          parameterSystemId: param.paramDefintionSystemId,
          ckvSystemId: ckv.systemId,
          payload: param.getPayloadCopy(),
        })),
      ),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert<CkvParameterPayloadRow>(
      this.manager,
      'CkvParameterPayload',
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByParamSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      const parentCkv =
        failedRow && typeof failedRow.ckvSystemId === 'number'
          ? ckvBySystemId.get(failedRow.ckvSystemId)
          : undefined;
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'CKV Parameter',
        failedRowJson: `Ckv parameter row: ${JSON.stringify(failedRow)}\nParent Ckv:${JSON.stringify(parentCkv)}`,
        dbError: error.message,
      };
    });
  }

  // ─── TKV Parameter ───────────────────────────────────────────────────────────

  private async insertTkvParameterPayloads(
    modules: SpfModule[],
  ): Promise<RawFailure[]> {
    const contextByParamSystemId = new Map<
      number,
      {
        readonly tkv: KvData;
        readonly tagData: TagData;
        readonly module: SpfModule;
      }
    >(
      modules.flatMap(m =>
        m.tagDataList.flatMap(tagData =>
          tagData.tkvs.flatMap(tkv =>
            tkv.parameterPayloads.map(
              param => [param.systemId, {tkv, tagData, module: m}] as const,
            ),
          ),
        ),
      ),
    );

    const tkvBySystemId = new Map<number, KvData>(
      modules.flatMap(m =>
        m.tagDataList.flatMap(tagData =>
          tagData.tkvs.map(tkv => [tkv.systemId, tkv] as const),
        ),
      ),
    );

    const rows: InsertRow<TkvParameterPayloadRow>[] = modules.flatMap(m =>
      m.tagDataList.flatMap(tagData =>
        tagData.tkvs.flatMap(tkv =>
          tkv.parameterPayloads.map(param => ({
            systemId: param.systemId,
            parameterSystemId: param.paramDefintionSystemId,
            tkvSystemId: tkv.systemId,
            payload: param.getPayloadCopy(),
          })),
        ),
      ),
    );

    if (rows.length === 0) return [];

    const {failedEntities} = await BatchInserter.insert<TkvParameterPayloadRow>(
      this.manager,
      'TkvParameterPayload',
      rows,
    );

    return failedEntities.map(error => {
      const ctx = contextByParamSystemId.get(error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      const parentTkv =
        failedRow && typeof failedRow.tkvSystemId === 'number'
          ? tkvBySystemId.get(failedRow.tkvSystemId)
          : undefined;
      return {
        systemId: ctx.module.systemId,
        entityLabel: 'TKV Parameter',
        failedRowJson: `Tkv parameter row: ${JSON.stringify(failedRow)}\nParent Ckv:${JSON.stringify(parentTkv)}`,
        dbError: error.message,
      };
    });
  }
}
