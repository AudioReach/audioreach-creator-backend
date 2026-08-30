/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ModuleRepository,
  UnitOfWork,
  EditOptions,
  SpfModuleBase,
  ExistingPayloadRow,
  CkvPayloadUpdate,
  WipeCalDataResult,
} from '@arc/core';
import {
  SpfModule,
  DataPort,
  ControlPort,
  serializeDefaultParameterData,
  CONFIGURATION_INCLUDES,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {CkvOverlayFetcher} from '../../fetchers/ckv-overlay-fetcher.js';
import {CkvParameterPayloadFetcher} from '../../fetchers/ckv-parameter-payload-fetcher.js';
import {TkvOverlayFetcher} from '../../fetchers/tkv-overlay-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

export class TypeOrmModuleRepository implements ModuleRepository {
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly portFetcher: PortOverlayFetcher;
  private readonly ckvOverlayFetcher: CkvOverlayFetcher;
  private readonly tkvOverlayFetcher: TkvOverlayFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(manager, editActionsQs);
    this.nodeFetcher = new NodeOverlayFetcher(manager, editActionsQs);
    this.portFetcher = new PortOverlayFetcher(
      manager,
      editActionsQs,
      new IntentFetcher(manager, editActionsQs),
    );
    this.ckvOverlayFetcher = new CkvOverlayFetcher(
      manager,
      editActionsQs,
      new CkvParameterPayloadFetcher(manager, editActionsQs),
    );
    this.tkvOverlayFetcher = new TkvOverlayFetcher(manager, editActionsQs);
  }

  async findModuleForPatch(
    systemId: number,
    fileSystemId: number,
  ): Promise<SpfModule | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [spfRows, nodeRows] = await Promise.all([
      this.spfModuleFetcher.fetchMany(fileSystemId, sessionId, {
        systemId: systemId,
      }),
      this.nodeFetcher.fetchMany([systemId], fileSystemId, sessionId),
    ]);
    const nodeMap = new Map(nodeRows.map(n => [n.systemId, n]));
    const spf = spfRows.at(0);
    if (spf === undefined) return null;
    const moduleNode = {
      ...spf,
      parentId: nodeMap.get(spf.systemId)?.parentId ?? null,
    };
    const dataPorts = await this.portFetcher.fetchDataPorts(
      systemId,
      fileSystemId,
      sessionId,
    );
    const controlPorts = await this.portFetcher.fetchControlPortsWithIntents(
      systemId,
      fileSystemId,
      sessionId,
    );
    return new SpfModule({
      systemId,
      fileSystemId,
      instanceId: moduleNode.instanceId,
      definitionSystemId: moduleNode.definitionSystemId,
      containerSystemId: moduleNode.containerSystemId,
      subgraphSystemId: moduleNode.subgraphSystemId,
      alias: moduleNode.alias ?? undefined,
      parentSystemId: moduleNode.parentId ?? undefined,
      dataPorts: dataPorts.map(
        dp =>
          new DataPort({
            systemId: dp.systemId,
            dataPortId: dp.dataPortId,
            portIoType: dp.portIoType,
            isStatic: dp.isStatic,
            name: dp.name ?? undefined,
          }),
      ),
      controlPorts: controlPorts.map(
        cp =>
          new ControlPort({
            systemId: cp.systemId,
            portId: cp.portId,
            isStatic: cp.isStatic,
            nodeSystemId: systemId,
            name: cp.name ?? undefined,
            intentSystemIds: cp.intents.map(i => i.systemId),
            intentTypeIds: cp.intents.map(i => i.intentId),
          }),
      ),
    });
  }

  async renameModule(
    moduleSystemId: number,
    alias: string,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: moduleSystemId,
        aggregateId: moduleSystemId,
        delta: {alias},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async changeContainer(
    moduleSystemId: number,
    containerSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: moduleSystemId,
        aggregateId: moduleSystemId,
        delta: {containerSystemId},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addDataPort(
    port: DataPort,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.DataPort,
        targetSystemId: port.systemId,
        aggregateId: moduleSystemId,
        payload: {
          dataPortId: port.dataPortId,
          portIoType: port.portIoType,
          isStatic: port.isStatic,
          name: port.name ?? '',
          nodeSystemId: moduleSystemId,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async removeDataPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.DataPort,
        targetSystemId: portSystemId,
        aggregateId: moduleSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addControlPort(
    port: ControlPort,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlPort,
        targetSystemId: port.systemId,
        aggregateId: moduleSystemId,
        payload: {
          portId: port.portId,
          isStatic: port.isStatic,
          name: port.name ?? '',
          nodeSystemId: moduleSystemId,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async removeControlPort(
    portSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlPort,
        targetSystemId: portSystemId,
        aggregateId: moduleSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async createModule(module: SpfModule, options?: EditOptions): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = module.fileSystemId;

    // FK order: Node → SpfModule → DataPorts → ControlPorts (all share ambient groupId)
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: module.systemId,
        aggregateId: module.systemId,
        payload: {
          type: 'module',
          parentId: module.parentId ?? null,
          fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: module.systemId,
        aggregateId: module.systemId,
        payload: {
          instanceId: module.instanceId,
          alias: module.alias ?? '',
          subgraphSystemId: module.subgraphSystemId,
          containerSystemId: module.containerSystemId,
          definitionSystemId: module.definitionSystemId,
          fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    for (const dp of module.dataPorts) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.DataPort,
          targetSystemId: dp.systemId,
          aggregateId: module.systemId,
          payload: {
            dataPortId: dp.dataPortId,
            portIoType: dp.portIoType,
            isStatic: dp.isStatic,
            name: dp.name ?? '',
            nodeSystemId: module.systemId,
            fileSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
    for (const cp of module.controlPorts) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.ControlPort,
          targetSystemId: cp.systemId,
          aggregateId: module.systemId,
          payload: {
            portId: cp.portId,
            isStatic: cp.isStatic,
            name: cp.name ?? '',
            nodeSystemId: module.systemId,
            fileSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async getSpfModuleForValidation(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [spfRows, nodeRows] = await Promise.all([
      this.spfModuleFetcher.fetchMany(fileSystemId, sessionId, {
        systemId: spfModuleSystemId,
      }),
      this.nodeFetcher.fetchMany([spfModuleSystemId], fileSystemId, sessionId),
    ]);
    const nodeMap = new Map(nodeRows.map(n => [n.systemId, n]));
    const spf = spfRows.at(0);
    if (!spf) return null;
    const row = {...spf, parentId: nodeMap.get(spf.systemId)?.parentId ?? null};
    return {
      systemId: row.systemId,
      definitionSystemId: row.definitionSystemId,
      subgraphSystemId: row.subgraphSystemId,
      containerSystemId: row.containerSystemId,
    };
  }

  async ckvExists(
    spfModuleSystemId: number,
    ckvSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const row = await this.ckvOverlayFetcher.fetchOne(
      ckvSystemId,
      spfModuleSystemId,
      sessionId,
    );
    return row !== null;
  }

  async getExistingCkvPayloads(
    spfModuleSystemId: number,
    ckvSystemId: number,
  ): Promise<ExistingPayloadRow[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.ckvOverlayFetcher.fetchPayloads(
      ckvSystemId,
      spfModuleSystemId,
      sessionId,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      parameterSystemId: r.parameterSystemId,
    }));
  }

  async setCkvCalData(
    spfModuleSystemId: number,
    ckvSystemId: number,
    payloadUpdates: CkvPayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    if (payloadUpdates.length > 0) {
      await this.writer.writeDeltaBatch(
        payloadUpdates.map(u => ({
          targetTable: ENTITY_NAMES.CkvParameterPayload,
          targetSystemId: u.payloadSystemId,
          aggregateId: spfModuleSystemId,
          delta: {payload: u.payload},
        })),
        session.sessionId,
        groupId,
        this.manager,
      );
    }
    if (uiPersistence !== undefined) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.Ckv,
          targetSystemId: ckvSystemId,
          aggregateId: spfModuleSystemId,
          delta: {uiPersistence: uiPersistence},
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  createCkv(
    _kvData: unknown,
    _moduleSystemId: number,
    _options?: EditOptions,
  ): Promise<void> {
    // TODO(add-module-calibration-defaults): stage CKV CREATE row + all
    // CkvParameterPayload CREATE rows in FK order.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §6
    return Promise.reject(new Error('createCkv: not yet implemented'));
  }

  async getModulesBySubgraphId(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase[]> {
    const {session} = this.uow.getWriteContext();
    const nodeIds = await this.moduleNodeFetcher.loadBaselineNodeIdsForSubgraph(
      subgraphSystemId,
      fileSystemId,
    );
    await this.moduleNodeFetcher.applySessionOverlayToNodesForSubgraph(
      subgraphSystemId,
      nodeIds,
      session.sessionId,
    );
    if (nodeIds.size === 0) return [];
    const rows = await this.moduleNodeFetcher.fetchOverLayedSpfModules(
      [...nodeIds],
      fileSystemId,
      session.sessionId,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      definitionSystemId: r.definitionSystemId,
      subgraphSystemId: r.subgraphSystemId,
      containerSystemId: r.containerSystemId,
    }));
  }

  async wipeCalData(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<WipeCalDataResult> {
    const {session, groupId} = this.uow.getWriteContext();

    const ckvs = await this.ckvOverlayFetcher.fetchForModule(
      moduleSystemId,
      session.sessionId,
    );
    const ckvDeletePlans = await this.readCkvDeletePlans(ckvs);
    const tkvDeletePlans = await this.readTkvDeletePlans(
      moduleSystemId,
      session.sessionId,
    );
    const zeroCkvResets = await this.readZeroCkvResets(
      ckvs,
      moduleSystemId,
      fileSystemId,
      session.sessionId,
    );
    const zeroCkv = ckvs.find(c => c.values.length === 0);

    const ckvsDeleted = await this.writeCkvDeletes(
      ckvDeletePlans,
      moduleSystemId,
      session.sessionId,
      groupId,
    );
    await this.writeTkvDeletes(
      tkvDeletePlans,
      moduleSystemId,
      session.sessionId,
      groupId,
    );
    const zeroCkvsAdded = await this.writeZeroCkvResets(
      zeroCkvResets,
      zeroCkv?.systemId,
      moduleSystemId,
      session.sessionId,
      groupId,
    );

    return {ckvsDeleted, zeroCkvsAdded};
  }

  private async readCkvDeletePlans(
    ckvs: Awaited<ReturnType<typeof this.ckvOverlayFetcher.fetchForModule>>,
  ): Promise<Array<{ckvId: number; payloadIds: number[]}>> {
    const nonZeroCkvs = ckvs.filter(c => c.values.length > 0);
    if (nonZeroCkvs.length === 0) return [];

    // Batch-fetch all payloads for all non-zero CKVs in one query
    const ckvIds = nonZeroCkvs.map(c => c.systemId);
    const allPayloads = await this.manager
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('p')
      .select('p.systemId', 'systemId')
      .addSelect('p.ckvSystemId', 'ckvSystemId')
      .where('p.ckvSystemId IN (:...ids)', {ids: ckvIds})
      .getRawMany<{systemId: number; ckvSystemId: number}>();

    const payloadsByCkv = new Map<number, number[]>();
    for (const p of allPayloads) {
      const list = payloadsByCkv.get(p.ckvSystemId) ?? [];
      list.push(p.systemId);
      payloadsByCkv.set(p.ckvSystemId, list);
    }

    return nonZeroCkvs.map(ckv => ({
      ckvId: ckv.systemId,
      payloadIds: payloadsByCkv.get(ckv.systemId) ?? [],
    }));
  }

  private async readTkvDeletePlans(
    moduleSystemId: number,
    sessionId: number,
  ): Promise<
    Array<{
      tagMapId: number;
      tkvs: Array<{tkvId: number; payloadIds: number[]}>;
    }>
  > {
    const tagMaps = await this.tkvOverlayFetcher.fetchForModule(
      moduleSystemId,
      sessionId,
      CONFIGURATION_INCLUDES.FullDetails,
    );
    if (tagMaps.length === 0) return [];

    const allTkvs = tagMaps.flatMap(tm => tm.tkvs ?? []);
    if (allTkvs.length === 0) {
      return tagMaps.map(tm => ({tagMapId: tm.systemId, tkvs: []}));
    }

    // Batch-fetch all TKV payloads in one query
    const tkvIds = allTkvs.map(t => t.systemId);
    const allPayloads = await this.manager
      .getRepository(ENTITY_NAMES.TkvParameterPayload)
      .createQueryBuilder('p')
      .select('p.systemId', 'systemId')
      .addSelect('p.tkvSystemId', 'tkvSystemId')
      .where('p.tkvSystemId IN (:...ids)', {ids: tkvIds})
      .getRawMany<{systemId: number; tkvSystemId: number}>();

    const payloadsByTkv = new Map<number, number[]>();
    for (const p of allPayloads) {
      const list = payloadsByTkv.get(p.tkvSystemId) ?? [];
      list.push(p.systemId);
      payloadsByTkv.set(p.tkvSystemId, list);
    }

    return tagMaps.map(tagMap => ({
      tagMapId: tagMap.systemId,
      tkvs: (tagMap.tkvs ?? []).map(tkv => ({
        tkvId: tkv.systemId,
        payloadIds: payloadsByTkv.get(tkv.systemId) ?? [],
      })),
    }));
  }

  private async readZeroCkvResets(
    ckvs: Awaited<ReturnType<typeof this.ckvOverlayFetcher.fetchForModule>>,
    moduleSystemId: number,
    fileSystemId: number,
    sessionId: number,
  ): Promise<
    Array<{payloadSystemId: number; defaultValue: Uint8Array | null}>
  > {
    const zeroCkv = ckvs.find(c => c.values.length === 0);
    if (!zeroCkv) return [];
    const mod = await this.moduleNodeFetcher.fetchOne(
      moduleSystemId,
      fileSystemId,
      sessionId,
    );
    if (!mod) return [];
    const resets: Array<{
      payloadSystemId: number;
      defaultValue: Uint8Array | null;
    }> = [];
    const existingPayloads = await this.ckvOverlayFetcher.fetchCkvPayloads(
      zeroCkv.systemId,
      moduleSystemId,
      sessionId,
    );
    if (existingPayloads.length === 0) return [];

    // Batch-fetch all parameter definitions in one query
    const paramSystemIds = existingPayloads.map(p => p.parameterSystemId);
    const allDefs = await this.uow
      .getModuleDefinitionRepository()
      .getParameterDefinitions(mod.definitionSystemId, paramSystemIds);
    const defsByParamId = new Map(allDefs.map(d => [d.systemId, d]));

    for (const payload of existingPayloads) {
      const def = defsByParamId.get(payload.parameterSystemId);
      if (!def) continue;
      const serialized = serializeDefaultParameterData(def);
      resets.push({
        payloadSystemId: payload.systemId,
        defaultValue: serialized.ok ? serialized.value : null,
      });
    }
    return resets;
  }

  private async writeCkvDeletes(
    plans: Array<{ckvId: number; payloadIds: number[]}>,
    moduleSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<number[]> {
    const deleted: number[] = [];
    await Promise.all(
      plans.map(async plan => {
        // Delete payloads first (FK order), then the CKV row
        await Promise.all(
          plan.payloadIds.map(payloadId =>
            this.writer.writeDelete(
              {
                targetTable: ENTITY_NAMES.CkvParameterPayload,
                targetSystemId: payloadId,
                aggregateId: moduleSystemId,
              },
              sessionId,
              groupId,
              this.manager,
            ),
          ),
        );
        await this.writer.writeDelete(
          {
            targetTable: ENTITY_NAMES.Ckv,
            targetSystemId: plan.ckvId,
            aggregateId: moduleSystemId,
          },
          sessionId,
          groupId,
          this.manager,
        );
        deleted.push(plan.ckvId);
      }),
    );
    return deleted;
  }

  private async writeTkvDeletes(
    plans: Array<{
      tagMapId: number;
      tkvs: Array<{tkvId: number; payloadIds: number[]}>;
    }>,
    moduleSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<void> {
    await Promise.all(
      plans.map(async plan => {
        // Delete TKV payloads + TKV rows, then the ModuleTagIdMap row
        await Promise.all(
          plan.tkvs.map(async tkv => {
            await Promise.all(
              tkv.payloadIds.map(payloadId =>
                this.writer.writeDelete(
                  {
                    targetTable: ENTITY_NAMES.TkvParameterPayload,
                    targetSystemId: payloadId,
                    aggregateId: plan.tagMapId,
                  },
                  sessionId,
                  groupId,
                  this.manager,
                ),
              ),
            );
            await this.writer.writeDelete(
              {
                targetTable: ENTITY_NAMES.Tkv,
                targetSystemId: tkv.tkvId,
                aggregateId: plan.tagMapId,
              },
              sessionId,
              groupId,
              this.manager,
            );
          }),
        );
        await this.writer.writeDelete(
          {
            targetTable: ENTITY_NAMES.ModuleTagIdMap,
            targetSystemId: plan.tagMapId,
            aggregateId: moduleSystemId,
          },
          sessionId,
          groupId,
          this.manager,
        );
      }),
    );
  }

  private async writeZeroCkvResets(
    resets: Array<{payloadSystemId: number; defaultValue: Uint8Array | null}>,
    zeroCkvSystemId: number | undefined,
    moduleSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<number[]> {
    if (!zeroCkvSystemId) return [];
    let anyReset = false;
    for (const reset of resets) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.CkvParameterPayload,
          targetSystemId: reset.payloadSystemId,
          aggregateId: moduleSystemId,
          delta: {payload: reset.defaultValue},
        },
        sessionId,
        groupId,
        this.manager,
      );
      anyReset = true;
    }
    return anyReset ? [zeroCkvSystemId] : [];
  }
}
