/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {ControlPortRow} from '../../entity-schema/usecase-data/node/control-port.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

/**
 * Returns the node that owns a control port, committed or created in the
 * session. Intent edit actions are grouped under that node, so intent
 * reads and writes both need it.
 */
export async function findControlPortOwner(
  manager: EntityManager,
  editActions: EditActionsQueryService,
  sessionId: number | null,
  portSystemId: number,
  fileSystemId: number,
): Promise<number> {
  const port = (await manager
    .getRepository(ENTITY_NAMES.ControlPort)
    .createQueryBuilder('port')
    .innerJoin('port.node', 'node')
    .where('port.systemId = :portSystemId', {portSystemId})
    .andWhere('node.fileSystemId = :fileSystemId', {fileSystemId})
    .getOne()) as ControlPortRow | null;
  if (port !== null) return port.nodeSystemId;

  if (sessionId !== null) {
    const actions = await editActions.getByTable(
      sessionId,
      ENTITY_NAMES.ControlPort,
    );
    const created = actions.find(
      action =>
        action.targetSystemId === portSystemId && action.operation === 'CREATE',
    );
    if (created !== undefined) return created.aggregateId;
  }
  throw new Error(
    `Control port ${portSystemId} not found in file ${fileSystemId}`,
  );
}
