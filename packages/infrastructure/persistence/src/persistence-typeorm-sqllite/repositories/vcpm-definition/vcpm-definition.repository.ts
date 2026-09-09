/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  IdGenerationPort,
  UnitOfWork,
  VcpmDefaultData,
  VcpmDefinitionRepository,
  VcpmModuleDefinitionWithParamsReadModel,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {VcpmModuleDefinitionFetcher} from '../../fetchers/definitions/vcpm/vcpm-module-definition-fetcher.js';

/** TypeORM adapter for effective VCPM definition reads and staged defaults. */
export class TypeOrmVcpmDefinitionRepository implements VcpmDefinitionRepository {
  private readonly definitionFetcher: VcpmModuleDefinitionFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    this.definitionFetcher = new VcpmModuleDefinitionFetcher(manager);
  }

  async getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    return this.definitionFetcher.fetchMany(fileSystemId);
  }

  async addVcpmCfgDefaultData(
    subgraphSystemId: number,
    defaults: readonly VcpmDefaultData[],
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const definition of defaults) {
      const instanceSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmInstance,
          targetSystemId: instanceSystemId,
          aggregateId: subgraphSystemId,
          payload: {
            subgraphSystemId,
            vcpmDefinitionId: definition.definitionSystemId,
          },
        },
        session.sessionId,
        groupId,
        this.manager,
      );

      const ckvSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmCkv,
          targetSystemId: ckvSystemId,
          aggregateId: subgraphSystemId,
          payload: {vcpmInstanceSystemId: instanceSystemId},
        },
        session.sessionId,
        groupId,
        this.manager,
      );

      for (const parameter of definition.parameters) {
        const payloadSystemId = await this.idGeneration.getNextId(
          session.fileSystemId,
        );
        await this.writer.writeCreate(
          {
            targetTable: ENTITY_NAMES.VcpmParameterPayload,
            targetSystemId: payloadSystemId,
            aggregateId: subgraphSystemId,
            payload: {
              vcpmCkvSystemId: ckvSystemId,
              vcpmParameterSystemId: parameter.parameterSystemId,
              payload: parameter.payload,
            },
          },
          session.sessionId,
          groupId,
          this.manager,
        );
      }
    }
  }
}
