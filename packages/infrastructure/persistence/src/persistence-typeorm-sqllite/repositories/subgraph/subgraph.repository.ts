/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  SubgraphRepository,
  UnitOfWork,
  EditOptions,
  Subgraph,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {}

  async subgraphExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const count = await this.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.Subgraph, 's')
      .where('s.systemId = :systemId AND s.fileSystemId = :fileSystemId', {
        systemId,
        fileSystemId,
      })
      .getCount();
    return count > 0;
  }

  async createSubgraph(
    subgraph: Subgraph,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Subgraph,
        targetSystemId: subgraph.systemId,
        aggregateId: subgraph.systemId,
        payload: {
          subgraphId: subgraph.subgraphId,
          name: subgraph.name,
          isExported: subgraph.isExported,
          fileSystemId: subgraph.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    // Stage SubgraphPropertyData rows — part of the same aggregate.
    for (const prop of subgraph.properties) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.SubgraphPropertyData,
          targetSystemId: subgraph.systemId,
          aggregateId: subgraph.systemId,
          payload: {
            subgraphSystemId: subgraph.systemId,
            propertyDefinitionSystemId: prop.propertyDefinitionSystemId,
            payload: prop.getPayloadCopy() ?? null,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }
}
