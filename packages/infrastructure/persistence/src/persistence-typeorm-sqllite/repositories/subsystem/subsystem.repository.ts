/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  EditOptions,
  PortIoType,
  SubsystemControlPortRef,
  SubsystemRepository,
  UnitOfWork,
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';

export class TypeOrmSubsystemRepository implements SubsystemRepository {
  private readonly writer: PendingChangeWriter;
  private readonly uow: UnitOfWork;
  private readonly portFetcher: PortOverlayFetcher;
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly editActionsQs: EditActionsQueryService;

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    const editActions = new EditActionsQueryService(this.manager);
    this.editActionsQs = editActions;
    this.subsystemFetcher = new SubsystemOverlayFetcher(
      this.manager,
      editActions,
    );
    this.portFetcher = new PortOverlayFetcher(
      this.manager,
      editActions,
      new IntentFetcher(this.manager, editActions),
    );
  }

  private readonly manager: EntityManager;

  async subsystemExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const count = await this.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.Node, 'n')
      .where(
        'n.systemId = :systemId AND n.fileSystemId = :fileSystemId AND n.type = :type',
        {systemId, fileSystemId, type: 'subsystem'},
      )
      .getCount();
    return count > 0;
  }

  async hasSubsystems(fileSystemId: number): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const subsystems = await this.subsystemFetcher.fetchAll(
      fileSystemId,
      sessionId,
    );
    return subsystems.length > 0;
  }

  async clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (ports.length === 0) return;
    const {session, groupId} = this.uow.getWriteContext();
    const subsystemByControlPortId = new Map(
      ports.map(port => [port.controlPortSystemId, port.subsystemSystemId]),
    );
    const effectiveSubsystems = await this.subsystemFetcher.fetchAll(
      fileSystemId,
      session.sessionId,
    );
    const effectiveSubsystemIds = new Set(
      effectiveSubsystems.map(subsystem => subsystem.systemId),
    );
    const controlPorts = await Promise.all(
      [...subsystemByControlPortId.entries()]
        .filter(([, subsystemSystemId]) =>
          effectiveSubsystemIds.has(subsystemSystemId),
        )
        .map(([controlPortSystemId, subsystemSystemId]) =>
          this.portFetcher.fetchControlPortsWithIntents(
            subsystemSystemId,
            fileSystemId,
            session.sessionId,
            {systemId: controlPortSystemId},
          ),
        ),
    );

    for (const port of controlPorts.flat()) {
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
}
