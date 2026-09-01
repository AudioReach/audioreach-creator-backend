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
  IdGenerationPort,
  ParameterDefinitionBase,
  VcpmPayloadRow,
  VcpmPayloadUpdate,
} from '@arc/core';
import {CHANGE_OPERATION, serializeDefaultParameterData} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {OverlayMerge} from '../../queries/edit-session/overlay-merge.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly overlay: OverlayMerge,
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
          isImported: subgraph.isExported,
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

  async getVcpmInstanceSystemId(
    subgraphSystemId: number,
    vcpmDefinitionSystemId: number,
  ): Promise<number | null> {
    const row = await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('vi')
      .where('vi.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
      .andWhere('vi.vcpmDefinitionId = :vcpmDefinitionSystemId', {
        vcpmDefinitionSystemId,
      })
      .getOne();
    return (row as {systemId: number} | null)?.systemId ?? null;
  }

  async vcpmCkvExistsBySystemId(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<boolean> {
    const {session} = this.uow.getWriteContext();
    const count = await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .innerJoin('ckv.vcpmInstance', 'vi')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .andWhere('vi.subgraphSystemId = :subgraphSystemId', {
        subgraphSystemId,
      })
      .getCount();

    const actions = await this.editActionsSvc.getByAggregateId(
      session.sessionId,
      subgraphSystemId,
    );
    const ckvActions = actions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.VcpmCkv &&
        action.targetSystemId === ckvSystemId,
    );
    if (
      ckvActions.some(action => action.operation === CHANGE_OPERATION.Delete)
    ) {
      return false;
    }
    return (
      count > 0 ||
      ckvActions.some(action => action.operation === CHANGE_OPERATION.Create)
    );
  }

  async vcpmCkvExists(
    instanceSystemId: number,
    valueSystemIds: number[],
  ): Promise<boolean> {
    const {session} = this.uow.getWriteContext();
    const sortedInput = [...valueSystemIds].sort((a, b) => a - b);
    const ckvRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'vals')
      .where('ckv.vcpmInstanceSystemId = :instanceSystemId', {
        instanceSystemId,
      })
      .getMany()) as Array<{
      systemId: number;
      values?: Array<{valueDefSystemId: number}>;
    }>;

    for (const ckv of ckvRows) {
      const existing = (ckv.values ?? [])
        .map(value => value.valueDefSystemId)
        .sort((a, b) => a - b);
      if (
        existing.length === sortedInput.length &&
        existing.every((value, index) => value === sortedInput[index])
      ) {
        return true;
      }
    }

    const stagedActions = await this.editActionsSvc.getByTable(
      session.sessionId,
      ENTITY_NAMES.VcpmCkv,
    );
    const stagedCkvIds = stagedActions
      .filter(
        action =>
          action.operation === CHANGE_OPERATION.Create &&
          (action.newValue as {vcpmInstanceSystemId: number})
            .vcpmInstanceSystemId === instanceSystemId,
      )
      .map(action => action.targetSystemId);

    for (const stagedCkvId of stagedCkvIds) {
      const stagedValues = (await this.manager
        .getRepository(ENTITY_NAMES.VcpmCkvValues)
        .createQueryBuilder('value')
        .where('value.vcpmCkvSystemId = :stagedCkvId', {stagedCkvId})
        .getMany()) as Array<{valueDefSystemId: number}>;
      const existing = stagedValues
        .map(value => value.valueDefSystemId)
        .sort((a, b) => a - b);
      if (
        existing.length === sortedInput.length &&
        existing.every((value, index) => value === sortedInput[index])
      ) {
        return true;
      }
    }

    return false;
  }

  async createVcpmCkv(
    subgraphSystemId: number,
    instanceSystemId: number,
    valueSystemIds: number[],
    params: ParameterDefinitionBase[],
  ): Promise<number> {
    const {session, groupId} = this.uow.getWriteContext();
    const ckvSystemId = await this.idGeneration.getNextId(session.fileSystemId);

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

    for (const valueSystemId of valueSystemIds) {
      await this.manager.getRepository(ENTITY_NAMES.VcpmCkvValues).insert({
        vcpmCkvSystemId: ckvSystemId,
        valueDefSystemId: valueSystemId,
      });
    }

    for (const param of params) {
      const payloadSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      const serialized = serializeDefaultParameterData(param);
      if (!serialized.ok) {
        throw new Error(
          `Failed to serialize default payload for VcpmParameterDefinition ${param.systemId}: ${serialized.error}`,
        );
      }
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: payloadSystemId,
          aggregateId: subgraphSystemId,
          payload: {
            vcpmCkvSystemId: ckvSystemId,
            vcpmParameterSystemId: param.systemId,
            payload: serialized.value,
          },
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    return ckvSystemId;
  }

  async deleteVcpmCkv(
    subgraphSystemId: number,
    ckvSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const payloads = await this.getVcpmCkvPayloads(
      ckvSystemId,
      subgraphSystemId,
    );

    for (const payload of payloads) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: payload.systemId,
          aggregateId: subgraphSystemId,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.VcpmCkv,
        targetSystemId: ckvSystemId,
        aggregateId: subgraphSystemId,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getVcpmCkvPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<VcpmPayloadRow[]> {
    const {session} = this.uow.getWriteContext();
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId})
      .getMany()) as Array<{
      systemId: number;
      vcpmParameterSystemId: number;
    }>;
    const actions = await this.editActionsSvc.getByAggregateId(
      session.sessionId,
      subgraphSystemId,
    );
    const payloadActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const overlaid = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      newValue => Number(newValue.vcpmCkvSystemId) === ckvSystemId,
    );

    return overlaid.map(result => {
      const effective = result.effective as {
        systemId: number;
        vcpmParameterSystemId: number;
      };
      return {
        systemId: effective.systemId,
        vcpmParameterSystemId: effective.vcpmParameterSystemId,
      };
    });
  }

  async updateVcpmCalData(
    subgraphSystemId: number,
    _ckvSystemId: number,
    updates: VcpmPayloadUpdate[],
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    for (const update of updates) {
      await this.writer.writeDelta(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: update.payloadSystemId,
          aggregateId: subgraphSystemId,
          delta: {payload: update.payload},
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }
}
