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

/** TypeORM adapter for effective VCPM definition reads and staged defaults. */
export class TypeOrmVcpmDefinitionRepository implements VcpmDefinitionRepository {
  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    const rows = await this.manager
      .createQueryBuilder()
      .select('vmd.systemId', 'moduleSystemId')
      .addSelect('vmd.naturalId', 'moduleDefinitionId')
      .addSelect('vmpd.systemId', 'paramSystemId')
      .addSelect('vmpd.naturalId', 'paramId')
      .addSelect('vmpd.elementsStructure', 'elementsStructure')
      .addSelect('vmpd.isReadOnly', 'isReadOnly')
      .from(ENTITY_NAMES.VcpmModuleDefinition, 'vmd')
      .leftJoin(
        ENTITY_NAMES.VcpmModuleParameterDefinition,
        'vmpd',
        'vmpd.vcpmModuleDefinitionSystemId = vmd.systemId',
      )
      .where('vmd.fileSystemId = :fileSystemId', {fileSystemId})
      .getRawMany<{
        moduleSystemId: number;
        moduleDefinitionId: number;
        paramSystemId: number | null;
        paramId: number | null;
        elementsStructure: string | null;
        isReadOnly: number | null;
      }>();

    const definitions = new Map<
      number,
      VcpmModuleDefinitionWithParamsReadModel
    >();
    for (const row of rows) {
      if (!definitions.has(row.moduleSystemId)) {
        definitions.set(row.moduleSystemId, {
          systemId: row.moduleSystemId,
          moduleDefinitionId: row.moduleDefinitionId,
          parameters: [],
        });
      }
      if (row.paramSystemId !== null) {
        definitions.get(row.moduleSystemId)!.parameters.push({
          systemId: row.paramSystemId,
          paramId: row.paramId ?? 0,
          elementsStructure: row.elementsStructure ?? '',
          isReadOnly: Boolean(row.isReadOnly),
        });
      }
    }
    return [...definitions.values()];
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
