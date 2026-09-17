/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  ControlPort,
  DataPort,
  Subsystem,
  type EditOptions,
  PortIoType,
  type SubsystemControlPortRef,
  type SubsystemKeyDefinition,
  type SubsystemRepository,
  type SubsystemSummary,
  type UnitOfWork,
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import type {NodeRow} from '../../entity-schema/usecase-data/node/node.schema.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';

export class TypeOrmSubsystemRepository implements SubsystemRepository {
  private readonly writer: PendingChangeWriter;
  private readonly uow: UnitOfWork;
  private readonly editActions: EditActionsQueryService;
  private readonly intents: IntentFetcher;
  private readonly ports: PortOverlayFetcher;
  private readonly subsystems: SubsystemOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;
  private readonly modules: SpfModuleOverlayFetcher;
  private readonly nodes: NodeOverlayFetcher;
  private readonly keyDefinitions: KeyValueDefinitionFetcher;

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    this.editActions = new EditActionsQueryService(this.manager);
    this.editActionsQs = editActions;
    this.intents = new IntentFetcher(this.manager, this.editActions);
    this.ports = new PortOverlayFetcher(
      this.manager,
      this.editActions,
      this.intents,
    );
    this.subsystems = new SubsystemOverlayFetcher(manager, this.editActions);
    this.modules = new SpfModuleOverlayFetcher(manager, this.editActions);
    this.nodes = new NodeOverlayFetcher(manager, this.editActions);
    this.keyDefinitions = new KeyValueDefinitionFetcher(
      manager,
      this.editActions,
      new ValueDefinitionFetcher(manager, this.editActions),
    );
  }

  private readonly manager: EntityManager;

  async findSubsystems(fileSystemId: number): Promise<SubsystemSummary[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subsystems.fetchAll(fileSystemId, sessionId);
    const modules = await this.modules.fetchMany(fileSystemId, sessionId);
    const nodeRows = await this.nodes.fetchMany(
      modules.map(module => module.systemId),
      fileSystemId,
      sessionId,
    );
    const parentByNode = new Map(
      nodeRows.map(node => [node.systemId, node.parentSystemId]),
    );
    const childrenBySubsystem = new Map<number, Set<number>>();
    for (const module of modules) {
      const parentId = parentByNode.get(module.systemId);
      if (parentId === undefined) continue;
      const subgraphs = childrenBySubsystem.get(parentId) ?? new Set<number>();
      subgraphs.add(module.subgraphSystemId);
      childrenBySubsystem.set(parentId, subgraphs);
    }
    return rows.map(row => ({
      systemId: row.systemId,
      naturalId: row.subsystemId ?? 0,
      name: row.name,
      parentId: row.parentSystemId,
      subgraphSystemIds: [
        ...(childrenBySubsystem.get(row.systemId) ?? new Set<number>()),
      ],
    }));
  }

  async findSubsystemFileSystemId(systemId: number): Promise<number | null> {
    const row = await this.manager
      .getRepository<NodeRow>(ENTITY_NAMES.Node)
      .findOne({where: {systemId, type: 'subsystem'}});
    return row?.fileSystemId ?? null;
  }

  async findNodeTopology(fileSystemId: number) {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.nodes.fetchAll(fileSystemId, sessionId);
    return rows.map(row => ({
      systemId: row.systemId,
      parentId: row.parentSystemId ?? null,
      type: row.type,
    }));
  }

  async findSubsystemForPatch(
    systemId: number,
    fileSystemId: number,
  ): Promise<Subsystem | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subsystems.fetchAll(fileSystemId, sessionId);
    const row = rows.find(subsystem => subsystem.systemId === systemId);
    if (!row) return null;
    const [dataPorts, controlPorts] = await Promise.all([
      this.ports.fetchDataPorts(systemId, fileSystemId, sessionId),
      this.ports.fetchControlPortsWithIntents(
        systemId,
        fileSystemId,
        sessionId,
      ),
    ]);
    return new Subsystem({
      systemId,
      fileSystemId,
      parentSystemId: row.parentSystemId,
      name: row.name,
      naturalId: row.subsystemId ?? 0,
      filteredKeySystemIds: row.filteredKeySystemIds ?? [],
      dataPorts: dataPorts.map(
        port =>
          new DataPort({
            systemId: port.systemId,
            naturalId: port.naturalId,
            portIoType: port.portIoType,
            isStatic: port.isStatic,
            name: port.name ?? undefined,
          }),
      ),
      controlPorts: controlPorts.map(
        port =>
          new ControlPort({
            systemId: port.systemId,
            naturalId: port.naturalId,
            isStatic: port.isStatic,
            nodeSystemId: systemId,
            name: port.name ?? undefined,
            intentSystemIds: port.intents.map(intent => intent.systemId),
            intentTypeIds: port.intents.map(intent => intent.naturalId),
          }),
      ),
    });
  }

  async findKeyDefinitionsByIds(
    keySystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SubsystemKeyDefinition[]> {
    if (keySystemIds.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const keys = await this.keyDefinitions.fetchMany(
      [...keySystemIds],
      fileSystemId,
      sessionId,
    );
    return keys.map(key => ({
      systemId: key.systemId,
      keyId: key.naturalId,
      name: key.name,
    }));
  }

  async subsystemExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subsystems.fetchAll(fileSystemId, sessionId);
    return rows.some(row => row.systemId === systemId);
  }

  async hasSubsystems(fileSystemId: number): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subsystems.fetchAll(fileSystemId, sessionId);
    return rows.length > 0;
  }

  async clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (ports.length === 0) return;
    const {session, groupId} = this.uow.getWriteContext();
    const controlPortSystemIds = new Set(
      ports.map(port => port.controlPortSystemId),
    );
    const subsystemSystemIds = [
      ...new Set(ports.map(port => port.subsystemSystemId)),
    ];
    const fetchedRows = await Promise.all(
      subsystemSystemIds.map(subsystemSystemId =>
        this.ports.fetchControlPortsWithIntents(
          subsystemSystemId,
          fileSystemId,
          session.sessionId,
        ),
      ),
    );
    const rows = fetchedRows
      .flat()
      .filter(port => controlPortSystemIds.has(port.systemId));

    for (const port of rows) {
      for (const intent of port.intents) {
        await this.writer.writeDelete(
          {
            targetTable: ENTITY_NAMES.Intent,
            targetSystemId: intent.systemId,
            aggregateId: port.nodeSystemId,
            ...options,
          },
          session.sessionId,
          groupId,
          this.manager,
        );
      }
    }
  }

  async getAllNodesWithParents(
    fileSystemId: number,
  ): Promise<Map<number, number | null>> {
    const rows = await this.manager
      .createQueryBuilder()
      .select(['n.systemId', 'n.parentId'])
      .from(ENTITY_NAMES.Node, 'n')
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{n_system_id: number; n_parent_id: number | null}>();
    const map = new Map<number, number | null>();
    for (const row of rows) {
      map.set(
        Number(row.n_system_id),
        row.n_parent_id === null ? null : Number(row.n_parent_id),
      );
    }
    return map;
  }

  async getPortIoType(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<PortIoType | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;

    // Check session overlay first — a staged CREATE wins over the base table
    const actions = await this.editActionsQs.getByTable(
      sessionId,
      ENTITY_NAMES.DataPort,
    );
    for (const action of actions) {
      if (
        action.operation === CHANGE_OPERATION.Create &&
        action.targetSystemId === portSystemId
      ) {
        const p = action.newValue as Record<string, unknown>;
        if (Number(p['fileSystemId']) === fileSystemId) {
          return (p['portIoType'] as PortIoType) ?? null;
        }
      }
    }

    // Fall through to base table
    const row = await this.manager
      .createQueryBuilder()
      .select(['dp.portIoType'])
      .from(ENTITY_NAMES.DataPort, 'dp')
      .where('dp.systemId = :systemId AND dp.fileSystemId = :fileSystemId', {
        systemId: portSystemId,
        fileSystemId,
      })
      .getRawOne<{dp_port_io_type: string}>();

    return (row?.dp_port_io_type as PortIoType) ?? null;
  }

  async isPortOccupiedAsSource(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const count = await this.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.SubsystemDataLink, 'sls')
      .where(
        'sls.sourcePortSystemId = :portSystemId AND sls.fileSystemId = :fileSystemId',
        {portSystemId, fileSystemId},
      )
      .getCount();
    return count > 0;
  }

  async isPortOccupiedAsDest(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const count = await this.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.SubsystemDataLink, 'sls')
      .where(
        'sls.destinationPortSystemId = :portSystemId AND sls.fileSystemId = :fileSystemId',
        {portSystemId, fileSystemId},
      )
      .getCount();
    return count > 0;
  }

  async portExists(
    portSystemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    return (await this.getPortIoType(portSystemId, fileSystemId)) !== null;
  }

  async createSubsystem(
    subsystem: Subsystem,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = subsystem.fileSystemId;

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: subsystem.systemId,
        aggregateId: subsystem.systemId,
        payload: {
          type: 'subsystem',
          parentSystemId: subsystem.parentSystemId ?? null,
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
        targetTable: ENTITY_NAMES.Subsystem,
        targetSystemId: subsystem.systemId,
        aggregateId: subsystem.systemId,
        payload: {
          subsystemId: subsystem.naturalId,
          name: subsystem.name,
          fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    for (const port of subsystem.dataPorts) {
      await this.addDataPort(port, subsystem.systemId, options);
    }
    for (const port of subsystem.controlPorts) {
      await this.addControlPort(port, subsystem.systemId, options);
    }
    if (subsystem.filteredKeySystemIds.length > 0) {
      await this.setFilteredKeys(
        subsystem.systemId,
        subsystem.filteredKeySystemIds,
        options,
      );
    }
  }

  async deleteSubsystem(
    systemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const sessionId = session.sessionId;
    const fileSystemId = session.fileSystemId;
    const [dataPorts, controlPorts] = await Promise.all([
      this.ports.fetchDataPorts(systemId, fileSystemId, sessionId),
      this.ports.fetchControlPortsWithIntents(
        systemId,
        fileSystemId,
        sessionId,
      ),
    ]);

    for (const port of controlPorts) {
      for (const intent of port.intents) {
        await this.writer.writeDelete(
          {
            targetTable: ENTITY_NAMES.Intent,
            targetSystemId: intent.systemId,
            aggregateId: systemId,
            ...options,
          },
          sessionId,
          groupId,
          this.manager,
        );
      }
    }
    for (const port of dataPorts) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.DataPort,
          targetSystemId: port.systemId,
          aggregateId: systemId,
          ...options,
        },
        sessionId,
        groupId,
        this.manager,
      );
    }
    for (const port of controlPorts) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.ControlPort,
          targetSystemId: port.systemId,
          aggregateId: systemId,
          ...options,
        },
        sessionId,
        groupId,
        this.manager,
      );
    }
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.Subsystem,
        targetSystemId: systemId,
        aggregateId: systemId,
        ...options,
      },
      sessionId,
      groupId,
      this.manager,
    );
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: systemId,
        aggregateId: systemId,
        ...options,
      },
      sessionId,
      groupId,
      this.manager,
    );
  }

  async renameSubsystem(
    systemId: number,
    name: string,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Subsystem,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: {name},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async setFilteredKeys(
    systemId: number,
    keySystemIds: number[],
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Subsystem,
        targetSystemId: systemId,
        aggregateId: systemId,
        delta: {filteredKeySystemIds: keySystemIds},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addDataPort(
    port: DataPort,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.DataPort,
        targetSystemId: port.systemId,
        aggregateId: subsystemSystemId,
        payload: {
          naturalId: port.naturalId,
          portIoType: port.portIoType,
          isStatic: port.isStatic,
          name: port.name ?? '',
          nodeSystemId: subsystemSystemId,
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
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.DataPort,
        targetSystemId: portSystemId,
        aggregateId: subsystemSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addControlPort(
    port: ControlPort,
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.ControlPort,
        targetSystemId: port.systemId,
        aggregateId: subsystemSystemId,
        payload: {
          naturalId: port.naturalId,
          isStatic: port.isStatic,
          name: port.name ?? '',
          nodeSystemId: subsystemSystemId,
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
    subsystemSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.ControlPort,
        targetSystemId: portSystemId,
        aggregateId: subsystemSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async updateParentId(
    subsystemSystemId: number,
    parentSubsystemSystemId: number | null,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Node,
        targetSystemId: subsystemSystemId,
        aggregateId: subsystemSystemId,
        delta: {parentSystemId: parentSubsystemSystemId},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }
}
