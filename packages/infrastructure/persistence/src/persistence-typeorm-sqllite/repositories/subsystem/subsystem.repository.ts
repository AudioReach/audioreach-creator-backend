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
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {ControlPortBase} from '../../entity-schema/usecase-data/node/control-port.js';

export class TypeOrmSubsystemRepository implements SubsystemRepository {
  private readonly writer: PendingChangeWriter;
  private readonly uow: UnitOfWork;
  private readonly editActions: EditActionsQueryService;
  private readonly intents: IntentFetcher;
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    writer: PendingChangeWriter,
    manager: EntityManager,
    uow: UnitOfWork,
  ) {
    this.writer = writer;
    this.manager = manager;
    this.uow = uow;
    this.editActions = new EditActionsQueryService(this.manager);
    this.intents = new IntentFetcher(this.manager, this.editActions);
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
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Node)
      .createQueryBuilder('n')
      .select(['n.systemId', 'n.type'])
      .where('n.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as Array<{systemId: number; type: string}>;
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const actions = await this.editActions.getByTable(
      sessionId,
      ENTITY_NAMES.Node,
    );
    return this.overlay
      .applyToCollection(
        baseRows,
        actions,
        payload => payload.fileSystemId === fileSystemId,
      )
      .some(result => result.effective.type === 'subsystem');
  }

  async clearControlPortIntents(
    ports: SubsystemControlPortRef[],
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    if (ports.length === 0) return;
    const {session, groupId} = this.uow.getWriteContext();
    const controlPortSystemIds = [
      ...new Set(ports.map(port => port.controlPortSystemId)),
    ];
    const subsystemByControlPortId = new Map(
      ports.map(port => [port.controlPortSystemId, port.subsystemSystemId]),
    );
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.ControlPort)
      .createQueryBuilder('cp')
      .innerJoin(
        ENTITY_NAMES.Node,
        'n',
        'n.systemId = cp.nodeSystemId AND n.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where(
        'cp.systemId IN (:...controlPortSystemIds) AND n.type = :nodeType',
        {controlPortSystemIds, nodeType: 'subsystem'},
      )
      .getMany()) as ControlPortBase[];
    const actions = await this.editActions.getByTable(
      session.sessionId,
      ENTITY_NAMES.ControlPort,
    );
    const rows = this.overlay
      .applyToCollection(
        baseRows,
        actions.filter(action =>
          controlPortSystemIds.includes(action.targetSystemId),
        ),
        payload =>
          subsystemByControlPortId.get(payload.systemId as number) ===
          payload.nodeSystemId,
      )
      .map(result => result.effective)
      .filter(
        port =>
          subsystemByControlPortId.get(port.systemId) === port.nodeSystemId,
      );

    for (const port of rows) {
      const portIntents = await this.intents.fetchMany(
        [port.systemId],
        port.nodeSystemId,
        session.sessionId,
      );
      for (const intent of portIntents) {
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
