/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  EditOptions,
  SubsystemControlPortRef,
  SubsystemRepository,
  UnitOfWork,
} from '@arc/core';
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

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    const editActions = new EditActionsQueryService(this.manager);
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
}
