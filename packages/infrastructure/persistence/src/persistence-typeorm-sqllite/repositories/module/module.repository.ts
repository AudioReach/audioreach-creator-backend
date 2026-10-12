/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  CONFIGURATION_INCLUDES,
  SpfModule,
  DataPort,
  ControlPort,
  Result,
  ERROR_CODES,
  IssueSeverity,
  type ModuleRepository,
  type UnitOfWork,
  type EditOptions,
  type SpfModuleBase,
  type PayloadEntry,
  type CkvPayloadEntry,
  type PayloadUpdate,
  type PortIoType,
  type CkvSummary,
  type TagSummary,
  type TkvSummary,
  type KvData,
  type IdGenerationPort,
  type KeyDefinitionSummaryReadModel,
  type ValueDefinitionSummaryReadModel,
  type TagDefinitionReadModel,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {SpfModuleDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {CkvOverlayFetcher} from '../../fetchers/ckv-overlay-fetcher.js';
import {CkvParameterPayloadFetcher} from '../../fetchers/ckv-parameter-payload-fetcher.js';
import {TkvOverlayFetcher} from '../../fetchers/tkv-overlay-fetcher.js';
import {TkvParameterPayloadFetcher} from '../../fetchers/tkv-parameter-payload-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {
  KeyValueDefinitionFetcher,
  type OverlaidKeyDefinition,
} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {TagDefinitionFetcher} from '../../fetchers/definitions/tag-key-value/tag-definition-fetcher.js';

export class TypeOrmModuleRepository implements ModuleRepository {
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly spfModuleDefinitionFetcher: SpfModuleDefinitionFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly portFetcher: PortOverlayFetcher;
  private readonly ckvOverlayFetcher: CkvOverlayFetcher;
  private readonly tkvOverlayFetcher: TkvOverlayFetcher;
  private readonly valueFetcher: ValueDefinitionFetcher;
  private readonly kvFetcher: KeyValueDefinitionFetcher;
  private readonly tagDefinitionFetcher: TagDefinitionFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(manager, editActionsQs);
    this.spfModuleDefinitionFetcher = new SpfModuleDefinitionFetcher(
      manager,
      editActionsQs,
    );
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
    this.tkvOverlayFetcher = new TkvOverlayFetcher(
      manager,
      editActionsQs,
      new TkvParameterPayloadFetcher(manager, editActionsQs),
    );
    this.valueFetcher = new ValueDefinitionFetcher(manager, editActionsQs);
    this.kvFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsQs,
      this.valueFetcher,
    );
    this.tagDefinitionFetcher = new TagDefinitionFetcher(
      manager,
      editActionsQs,
    );
  }

  async findModuleById(
    systemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase | null> {
    const rows = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
      {systemId},
    );
    const row = rows.at(0);
    return row ? this.toModuleBase(row) : null;
  }

  async findModulesByContainerId(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleBase[]> {
    const rows = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
      {containerSystemId},
    );
    return rows.map(row => this.toModuleBase(row));
  }

  async findModulesBySubgraphIds(
    subgraphSystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SpfModuleBase[]> {
    if (subgraphSystemIds.length === 0) return [];

    const rows = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
      {subgraphSystemId: [...new Set(subgraphSystemIds)]},
    );
    return rows.map(row => this.toModuleBase(row));
  }

  private toModuleBase(row: {
    systemId: number;
    definitionSystemId: number;
    containerSystemId: number;
    subgraphSystemId: number;
    alias?: string | null;
  }): SpfModuleBase {
    return {
      systemId: row.systemId,
      definitionSystemId: row.definitionSystemId,
      containerSystemId: row.containerSystemId,
      subgraphSystemId: row.subgraphSystemId,
      alias: row.alias ?? undefined,
    };
  }

  async getModulesWithStackSizeByContainer(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<Array<{moduleSystemId: number; stackSize: number}>> {
    const modules = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
      {containerSystemId},
    );
    const definitionSystemIds = [
      ...new Set(modules.map(module => module.definitionSystemId)),
    ];
    if (definitionSystemIds.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const definitions = await Promise.all(
      definitionSystemIds.map(definitionSystemId =>
        this.spfModuleDefinitionFetcher.fetchOne(
          definitionSystemId,
          fileSystemId,
          sessionId,
        ),
      ),
    );
    const stackSizes = new Map(
      definitions.flatMap(definition =>
        definition
          ? [[definition.systemId, Number(definition.stackSize)] as const]
          : [],
      ),
    );
    return modules.flatMap(module => {
      const stackSize = stackSizes.get(module.definitionSystemId);
      return stackSize === undefined
        ? []
        : [{moduleSystemId: module.systemId, stackSize}];
    });
  }

  async deleteModule(
    moduleSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const sessionId = session.sessionId;
    const [dataPorts, controlPorts, ckvs, tagMaps] = await Promise.all([
      this.portFetcher.fetchDataPorts(moduleSystemId, fileSystemId, sessionId),
      this.portFetcher.fetchControlPortsWithIntents(
        moduleSystemId,
        fileSystemId,
        sessionId,
      ),
      this.ckvOverlayFetcher.fetchMany(moduleSystemId, sessionId),
      this.tkvOverlayFetcher.fetchMany(
        moduleSystemId,
        sessionId,
        CONFIGURATION_INCLUDES.FullDetails,
      ),
    ]);
    const ckvPayloadArrays = await Promise.all(
      ckvs.map(ckv =>
        this.ckvOverlayFetcher.fetchPayloads(
          ckv.systemId,
          moduleSystemId,
          sessionId,
        ),
      ),
    );
    const ckvPayloads = ckvPayloadArrays.flat();
    const tkvs = tagMaps.flatMap(tagMap => tagMap.tkvs);
    const tkvPayloadArrays = await Promise.all(
      tkvs.map(tkv =>
        this.tkvOverlayFetcher.fetchPayloads(tkv.systemId, sessionId),
      ),
    );
    const tkvPayloads = tkvPayloadArrays.flat();

    const deleteRow = async (
      targetTable: keyof typeof ENTITY_NAMES,
      targetSystemId: number,
      aggregateId = moduleSystemId,
    ): Promise<void> => {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES[targetTable],
          targetSystemId,
          aggregateId,
          ...options,
        },
        sessionId,
        groupId,
        this.manager,
      );
    };

    for (const intent of controlPorts.flatMap(port => port.intents)) {
      await deleteRow('Intent', intent.systemId);
    }
    for (const port of dataPorts) {
      await deleteRow('DataPort', port.systemId);
    }
    for (const port of controlPorts) {
      await deleteRow('ControlPort', port.systemId);
    }
    for (const payload of ckvPayloads) {
      await deleteRow('CkvParameterPayload', payload.systemId);
    }
    for (const payload of tkvPayloads) {
      await deleteRow('TkvParameterPayload', payload.systemId);
    }
    for (const ckv of ckvs) await deleteRow('Ckv', ckv.systemId);
    for (const tkv of tkvs) await deleteRow('Tkv', tkv.systemId);
    for (const tagMap of tagMaps) {
      await deleteRow('ModuleTagIdMap', tagMap.systemId);
    }
    await deleteRow('SpfModule', moduleSystemId);
    await deleteRow('Node', moduleSystemId);
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
      parentSystemId: nodeMap.get(spf.systemId)?.parentSystemId ?? null,
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
      naturalId: moduleNode.naturalId,
      definitionSystemId: moduleNode.definitionSystemId,
      containerSystemId: moduleNode.containerSystemId,
      subgraphSystemId: moduleNode.subgraphSystemId,
      alias: moduleNode.alias ?? undefined,
      parentSystemId: moduleNode.parentSystemId ?? undefined,
      dataPorts: dataPorts.map(
        dp =>
          new DataPort({
            systemId: dp.systemId,
            naturalId: dp.naturalId,
            portIoType: dp.portIoType,
            isStatic: dp.isStatic,
            name: dp.name ?? undefined,
          }),
      ),
      controlPorts: controlPorts.map(
        cp =>
          new ControlPort({
            systemId: cp.systemId,
            naturalId: cp.naturalId,
            isStatic: cp.isStatic,
            nodeSystemId: systemId,
            name: cp.name ?? undefined,
            intentSystemIds: cp.intents.map(i => i.systemId),
            intentTypeIds: cp.intents.map(i => i.naturalId),
          }),
      ),
    });
  }

  async findModulePortsForLink(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<{
    subgraphSystemId: number;
    ports: {systemId: number; portIoType: PortIoType}[];
  } | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const modules = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      sessionId,
      {systemId: moduleSystemId},
    );
    const module = modules.at(0);
    if (module === undefined) return null;
    const dataPorts = await this.portFetcher.fetchDataPorts(
      moduleSystemId,
      fileSystemId,
      sessionId,
    );
    return {
      subgraphSystemId: module.subgraphSystemId,
      ports: dataPorts.map(dp => ({
        systemId: dp.systemId,
        portIoType: dp.portIoType,
      })),
    };
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
          naturalId: port.naturalId,
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

  async deleteDataPort(
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
          naturalId: port.naturalId,
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

  async deleteControlPort(
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

  async updateParentId(
    moduleSystemId: number,
    parentSubsystemSystemId: number | null,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: moduleSystemId,
        aggregateId: moduleSystemId,
        delta: {parentSystemId: parentSubsystemSystemId},
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
          parentSystemId: module.parentSystemId ?? null,
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
          naturalId: module.naturalId,
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
            naturalId: dp.naturalId,
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
            naturalId: cp.naturalId,
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

  async getCkvPayloadEntries(
    spfModuleSystemId: number,
    ckvSystemId: number,
  ): Promise<{systemId: number; parameterSystemId: number}[]> {
    return this.fetchCkvPayloadEntries(ckvSystemId, spfModuleSystemId);
  }

  async setCkvData(
    spfModuleSystemId: number,
    ckvSystemId: number,
    payloadUpdates: PayloadUpdate[],
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

  async tagExists(
    spfModuleSystemId: number,
    tagSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return this.tkvOverlayFetcher.fetchModuleTagIdMap(
      tagSystemId,
      spfModuleSystemId,
      sessionId,
    );
  }

  async tkvExists(tkvSystemId: number): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const row = await this.tkvOverlayFetcher.fetchTkv(tkvSystemId, sessionId);
    return row !== null;
  }

  async getTkvPayloadEntries(
    _moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<{systemId: number; parameterSystemId: number}[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.tkvOverlayFetcher.fetchPayloads(
      tkvSystemId,
      sessionId,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      parameterSystemId: r.parameterSystemId,
    }));
  }

  async setTkvData(
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
    payloadUpdates: PayloadUpdate[],
    uiPersistence?: string,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    if (payloadUpdates.length > 0) {
      await this.writer.writeDeltaBatch(
        payloadUpdates.map(u => ({
          targetTable: ENTITY_NAMES.TkvParameterPayload,
          targetSystemId: u.payloadSystemId,
          aggregateId: moduleTagIdMapSystemId,
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
          targetTable: ENTITY_NAMES.Tkv,
          targetSystemId: tkvSystemId,
          aggregateId: moduleTagIdMapSystemId,
          delta: {uiPersistence},
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async createCkv(
    kvData: KvData,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    // FK order: Ckv first, then CkvParameterPayload children
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Ckv,
        targetSystemId: kvData.systemId,
        aggregateId: moduleSystemId,
        payload: {
          spfModuleSystemId: moduleSystemId,
          uiPersistence: kvData.uiPersistence,
          valueDefinitionSystemIds: kvData.valueDefinitionSystemIds,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    for (const param of kvData.parameterPayloads) {
      await this.addParameterToCkv(
        kvData.systemId,
        moduleSystemId,
        param.paramDefintionSystemId,
        param.getPayloadCopy(),
        options,
      );
    }
  }

  async getAllCkvsForModule(
    spfModuleSystemId: number,
    _fileSystemId: number,
  ): Promise<CkvSummary[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.ckvOverlayFetcher.fetchMany(
      spfModuleSystemId,
      sessionId,
    );
    return overlaid.map(r => ({
      systemId: r.systemId,
      spfModuleSystemId,
      valueDefinitionSystemIds: r.values.map(v => v.valueDefSystemId),
    }));
  }

  private async fetchCkvPayloadEntries(
    ckvSystemId: number,
    spfModuleSystemId: number,
  ): Promise<PayloadEntry[]> {
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

  async deleteCkv(
    ckvSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const payloads = await this.fetchCkvPayloadEntries(
      ckvSystemId,
      moduleSystemId,
    );
    for (const payload of payloads) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.CkvParameterPayload,
          targetSystemId: payload.systemId,
          aggregateId: moduleSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.Ckv,
        targetSystemId: ckvSystemId,
        aggregateId: moduleSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getAllTagsForModule(
    spfModuleSystemId: number,
    _fileSystemId: number,
  ): Promise<TagSummary[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.tkvOverlayFetcher.fetchMany(
      spfModuleSystemId,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      spfModuleSystemId,
      tagDefinitionSystemId: r.tagDefinitionSystemId,
    }));
  }

  async getTagBySystemId(
    tagSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TagSummary | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const match = await this.tkvOverlayFetcher.fetchTagMap(
      tagSystemId,
      spfModuleSystemId,
      sessionId,
    );
    return match
      ? {
          systemId: match.systemId,
          spfModuleSystemId,
          tagDefinitionSystemId: match.tagDefinitionSystemId,
        }
      : null;
  }

  async createTag(
    tagSystemId: number,
    spfModuleSystemId: number,
    tagDefinitionSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ModuleTagIdMap,
        targetSystemId: tagSystemId,
        aggregateId: spfModuleSystemId,
        payload: {
          spfModuleSystemId,
          tagDefinitionSystemId,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async deleteTag(
    tagSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ModuleTagIdMap,
        targetSystemId: tagSystemId,
        aggregateId: moduleSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getAllTkvsForTag(
    tagSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TkvSummary[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const allTagMaps = await this.tkvOverlayFetcher.fetchMany(
      spfModuleSystemId,
      sessionId,
      CONFIGURATION_INCLUDES.Summary,
    );
    const matchingTag = allTagMaps.find(t => t.systemId === tagSystemId);
    if (!matchingTag) return [];
    return matchingTag.tkvs.map(tkv => ({
      systemId: tkv.systemId,
      moduleTagIdMapSystemId: tagSystemId,
      valueDefinitionSystemIds: tkv.values.map(v => v.valueDefSystemId),
    }));
  }

  async getTkvBySystemId(
    tkvSystemId: number,
    spfModuleSystemId: number,
  ): Promise<TkvSummary | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const tkv = await this.tkvOverlayFetcher.fetchTkv(tkvSystemId, sessionId);
    if (!tkv) return null;

    const tagMap = await this.tkvOverlayFetcher.fetchTagMap(
      tkv.moduleTagIdMapSystemId,
      spfModuleSystemId,
      sessionId,
    );
    if (!tagMap) return null;

    return {
      systemId: tkv.systemId,
      moduleTagIdMapSystemId: tkv.moduleTagIdMapSystemId,
      valueDefinitionSystemIds: tkv.values.map(v => v.valueDefSystemId),
    };
  }

  async createTkv(
    kvData: KvData,
    tagSystemId: number,
    _moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Tkv,
        targetSystemId: kvData.systemId,
        aggregateId: tagSystemId,
        payload: {
          moduleTagIdMapSystemId: tagSystemId,
          uiPersistence: kvData.uiPersistence,
          valueDefinitionSystemIds: kvData.valueDefinitionSystemIds,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    for (const param of kvData.parameterPayloads) {
      await this.addParameterToTkv(
        kvData.systemId,
        tagSystemId,
        param.paramDefintionSystemId,
        param.getPayloadCopy(),
        options,
      );
    }
  }

  async deleteTkv(
    tkvSystemId: number,
    tagSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const payloads = await this.tkvOverlayFetcher.fetchPayloads(
      tkvSystemId,
      session.sessionId,
    );
    for (const payload of payloads) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.TkvParameterPayload,
          targetSystemId: payload.systemId,
          aggregateId: tagSystemId,
          payload: {tkvSystemId},
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.Tkv,
        targetSystemId: tkvSystemId,
        aggregateId: tagSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getCkvPayloadsForParameters(
    spfModuleSystemId: number,
    parameterSystemIds: readonly number[],
  ): Promise<CkvPayloadEntry[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const ckvs = await this.ckvOverlayFetcher.fetchMany(
      spfModuleSystemId,
      sessionId,
    );
    const payloadsByCkv = await this.ckvOverlayFetcher.fetchPayloadsForMany(
      ckvs.map(c => c.systemId),
      spfModuleSystemId,
      sessionId,
    );
    const paramSet = new Set(parameterSystemIds);
    const result: CkvPayloadEntry[] = [];
    for (const [ckvSystemId, rows] of payloadsByCkv) {
      for (const r of rows) {
        if (paramSet.has(r.parameterSystemId)) {
          result.push({
            systemId: r.systemId,
            ckvSystemId,
            parameterSystemId: r.parameterSystemId,
          });
        }
      }
    }
    return result;
  }

  async getCkvPayloadCountByCkvs(
    ckvSystemIds: readonly number[],
    spfModuleSystemId: number,
  ): Promise<Map<number, number>> {
    if (ckvSystemIds.length === 0) return new Map();
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const payloadsByCkv = await this.ckvOverlayFetcher.fetchPayloadsForMany(
      ckvSystemIds,
      spfModuleSystemId,
      sessionId,
    );
    return new Map(
      [...payloadsByCkv.entries()].map(([id, ps]) => [id, ps.length]),
    );
  }

  async addParameterToCkv(
    ckvSystemId: number,
    moduleSystemId: number,
    parameterSystemId: number,
    payload: Uint8Array,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const payloadSystemId = await this.idGeneration.getNextId(
      session.fileSystemId,
    );
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.CkvParameterPayload,
        targetSystemId: payloadSystemId,
        aggregateId: moduleSystemId,
        payload: {
          ckvSystemId,
          parameterSystemId,
          payload,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async deleteParameterFromCkv(
    payloadSystemId: number,
    _ckvSystemId: number,
    moduleSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.CkvParameterPayload,
        targetSystemId: payloadSystemId,
        aggregateId: moduleSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addParameterToTkv(
    tkvSystemId: number,
    tagSystemId: number,
    parameterSystemId: number,
    payload: Uint8Array,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const payloadSystemId = await this.idGeneration.getNextId(
      session.fileSystemId,
    );
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.TkvParameterPayload,
        targetSystemId: payloadSystemId,
        aggregateId: tagSystemId,
        payload: {
          tkvSystemId,
          parameterSystemId,
          payload,
          fileSystemId: session.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async deleteParameterFromTkv(
    payloadSystemId: number,
    tkvSystemId: number,
    tagSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.TkvParameterPayload,
        targetSystemId: payloadSystemId,
        aggregateId: tagSystemId,
        payload: {tkvSystemId},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async updateHeapId(moduleSystemId: number, heapId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SpfModule,
        targetSystemId: moduleSystemId,
        aggregateId: moduleSystemId,
        delta: {heapId},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async DeleteAllCkvData(
    _moduleSystemId: number,
    _fileSystemId: number,
  ): Promise<void> {
    // TODO
  }

  async DeleteAllTkvData(
    moduleSystemId: number,
    _fileSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const tkvDeleteTargets = await this.readTkvDeleteTargets(
      moduleSystemId,
      session.sessionId,
    );
    await this.writeTkvDeletes(
      tkvDeleteTargets,
      moduleSystemId,
      session.sessionId,
      groupId,
    );
  }

  private async readTkvDeleteTargets(
    moduleSystemId: number,
    sessionId: number,
  ): Promise<
    Array<{
      tagMapSystemId: number;
      tkvs: Array<{tkvId: number; payloadIds: number[]}>;
    }>
  > {
    const tagMaps = await this.tkvOverlayFetcher.fetchMany(
      moduleSystemId,
      sessionId,
      CONFIGURATION_INCLUDES.FullDetails,
    );
    if (tagMaps.length === 0) return [];

    const allTkvs = tagMaps.flatMap(tm => tm.tkvs ?? []);
    if (allTkvs.length === 0) {
      return tagMaps.map(tm => ({tagMapSystemId: tm.systemId, tkvs: []}));
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
      tagMapSystemId: tagMap.systemId,
      tkvs: (tagMap.tkvs ?? []).map(tkv => ({
        tkvId: tkv.systemId,
        payloadIds: payloadsByTkv.get(tkv.systemId) ?? [],
      })),
    }));
  }

  private async writeTkvDeletes(
    targets: Array<{
      tagMapSystemId: number;
      tkvs: Array<{tkvId: number; payloadIds: number[]}>;
    }>,
    moduleSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<void> {
    await Promise.all(
      targets.map(async target => {
        // Delete TKV payloads + TKV rows, then the ModuleTagIdMap row
        await Promise.all(
          target.tkvs.map(async tkv => {
            await Promise.all(
              tkv.payloadIds.map(payloadId =>
                this.writer.writeDelete(
                  {
                    targetTable: ENTITY_NAMES.TkvParameterPayload,
                    targetSystemId: payloadId,
                    aggregateId: target.tagMapSystemId,
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
                aggregateId: target.tagMapSystemId,
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
            targetSystemId: target.tagMapSystemId,
            aggregateId: moduleSystemId,
          },
          sessionId,
          groupId,
          this.manager,
        );
      }),
    );
  }

  async getKeyValueSummaryForGivenValues(
    valueDefSystemIds: number[],
    fileSystemId: number,
  ): Promise<
    Result<
      Array<{
        key: KeyDefinitionSummaryReadModel;
        value: ValueDefinitionSummaryReadModel;
      }>
    >
  > {
    if (valueDefSystemIds.length === 0) return Result.ok([]);

    try {
      const sessionId = this.uow.getWriteContext().session.sessionId;

      const overlaidValues = await this.valueFetcher.fetchMany(
        valueDefSystemIds,
        sessionId,
      );
      const foundValueIds = new Set(overlaidValues.map(r => r.systemId));
      const missingValueIds = valueDefSystemIds.filter(
        id => !foundValueIds.has(id),
      );

      const requestedValueIdsByKeyId = new Map<number, number[]>();
      for (const row of overlaidValues) {
        const bucket = requestedValueIdsByKeyId.get(row.keySystemId) ?? [];
        bucket.push(row.systemId);
        requestedValueIdsByKeyId.set(row.keySystemId, bucket);
      }

      const keySystemIds = [...requestedValueIdsByKeyId.keys()];

      if (keySystemIds.length === 0) {
        return missingValueIds.length > 0
          ? Result.fail(
              ...missingValueIds.map(id => ({
                code: ERROR_CODES.ENTITY_NOT_FOUND,
                message: `ValueDefinition not found for systemId=${id}`,
                severity: IssueSeverity.Error,
              })),
            )
          : Result.ok([]);
      }

      const keys = await this.kvFetcher.fetchMany(
        keySystemIds,
        fileSystemId,
        sessionId,
      );
      const keyMap = new Map(keys.map(k => [k.systemId, k]));

      const requestedIds = new Set(valueDefSystemIds);

      const pairs = this.buildKeyValuePairs(
        requestedValueIdsByKeyId,
        keyMap,
        requestedIds,
        missingValueIds,
      );

      if (missingValueIds.length > 0) {
        return Result.partial(
          pairs,
          missingValueIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `ValueDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }

      return Result.ok(pairs);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load value definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  private buildKeyValuePairs(
    requestedValueIdsByKeyId: Map<number, number[]>,
    keyMap: Map<number, OverlaidKeyDefinition>,
    requestedIds: Set<number>,
    missingValueIds: number[],
  ): Array<{
    key: KeyDefinitionSummaryReadModel;
    value: ValueDefinitionSummaryReadModel;
  }> {
    const pairs: Array<{
      key: KeyDefinitionSummaryReadModel;
      value: ValueDefinitionSummaryReadModel;
    }> = [];
    for (const [keyId, valueIds] of requestedValueIdsByKeyId) {
      const key = keyMap.get(keyId);
      if (!key) {
        missingValueIds.push(...valueIds);
        continue;
      }
      for (const value of key.values) {
        if (requestedIds.has(value.systemId)) {
          pairs.push({
            key: {
              systemId: key.systemId,
              naturalId: key.naturalId,
              name: key.name,
              description: key.description,
            },
            value: {
              systemId: value.systemId,
              naturalId: value.naturalId,
              name: value.name,
              description: value.description,
            },
          });
        }
      }
    }
    return pairs;
  }

  async getTagDefinition(
    fileSystemId: number,
    tagDefinitionSystemId: number,
  ): Promise<TagDefinitionReadModel | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.tagDefinitionFetcher.fetchOne(
      tagDefinitionSystemId,
      fileSystemId,
      sessionId,
    );
    if (!overlaid) return null;

    return {
      systemId: overlaid.systemId,
      naturalId: overlaid.naturalId,
      name: overlaid.name,
      description: overlaid.description,
      isVoice: overlaid.isVoice,
      cHeaderEnumName: overlaid.cHeaderEnumName,
      cHeaderEnumMember: overlaid.cHeaderEnumValue,
      keys: [],
    };
  }
}
