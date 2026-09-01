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
  SessionChanged,
  SgkvEntry,
  IdGenerationPort,
  ParameterDefinitionBase,
  VcpmPayloadRow,
  VcpmPayloadUpdate,
} from '@arc/core';
import {Subgraph as SubgraphEntity,
        SubgraphPropertyDefinition,
        CHANGE_OPERATION, 
        serializeDefaultParameterData
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {SubgraphBase} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {OverlayMerge} from '../../queries/edit-session/overlay-merge.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;
  private readonly sgkvFetcher: SubgraphSgkvFetcher;
  private readonly propertyDataFetcher: SubgraphPropertyDataFetcher;
  private readonly valueDefFetcher: ValueDefinitionFetcher;
  private readonly propertyDefinitionFetcher: SubgraphPropertyDefinitionFetcher;
  private readonly editActions: EditActionsQueryService;
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.editActions = editActionsQs;
    this.sgkvFetcher = new SubgraphSgkvFetcher(manager, editActionsQs);
    this.propertyDataFetcher = new SubgraphPropertyDataFetcher(
      manager,
      editActionsQs,
    );
    this.subgraphFetcher = new SubgraphOverlayFetcher(
      manager,
      editActionsQs,
      this.propertyDataFetcher,
      this.sgkvFetcher,
    );
    this.valueDefFetcher = new ValueDefinitionFetcher(manager, editActionsQs);
    this.propertyDefinitionFetcher = new SubgraphPropertyDefinitionFetcher(
      manager,
      editActionsQs,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async subgraphExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return (
      (await this.subgraphFetcher.fetchOne(
        systemId,
        fileSystemId,
        sessionId,
      )) !== null
    );
  }

  async deleteSubgraph(
    subgraphSystemId: number,
    _fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const subgraph = await this.subgraphFetcher.fetchOne(
      subgraphSystemId,
      session.fileSystemId,
      session.sessionId,
    );
    if (!subgraph) return;

    const properties = await this.propertyDataFetcher.fetchMany(
      [subgraphSystemId],
      session.sessionId,
    );
    const sgkvs = await this.sgkvFetcher.fetchMany(
      session.fileSystemId,
      session.sessionId,
      [subgraphSystemId],
    );
    const instanceBase = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('instance')
      .where('instance.subgraphSystemId = :subgraphSystemId', {
        subgraphSystemId,
      })
      .getMany()) as Array<{systemId: number; subgraphSystemId: number}>;
    const instanceActionsForSession = await this.editActions.getByTable(
      session.sessionId,
      ENTITY_NAMES.VcpmInstance,
    );
    const instances = this.overlay
      .applyToCollection(
        instanceBase,
        instanceActionsForSession,
        payload => payload.subgraphSystemId === subgraphSystemId,
      )
      .map(result => result.effective);
    const instanceIds = instances.map(instance => instance.systemId);
    const vcpmCkvBase =
      instanceIds.length === 0
        ? []
        : ((await this.manager
            .getRepository(ENTITY_NAMES.VcpmCkv)
            .createQueryBuilder('vcpmCkv')
            .where('vcpmCkv.vcpmInstanceSystemId IN (:...instanceIds)', {
              instanceIds,
            })
            .getMany()) as Array<{
            systemId: number;
            vcpmInstanceSystemId: number;
          }>);
    const vcpmCkvActionsForSession = await this.editActions.getByTable(
      session.sessionId,
      ENTITY_NAMES.VcpmCkv,
    );
    const vcpmCkvs = this.overlay
      .applyToCollection(vcpmCkvBase, vcpmCkvActionsForSession, payload =>
        instanceIds.includes(payload.vcpmInstanceSystemId as number),
      )
      .map(result => result.effective);
    const vcpmCkvIds = vcpmCkvs.map(row => row.systemId);
    const vcpmPayloadBase =
      vcpmCkvIds.length === 0
        ? []
        : ((await this.manager
            .getRepository(ENTITY_NAMES.VcpmParameterPayload)
            .createQueryBuilder('payload')
            .where('payload.vcpmCkvSystemId IN (:...vcpmCkvIds)', {
              vcpmCkvIds,
            })
            .getMany()) as Array<{
            systemId: number;
            vcpmCkvSystemId: number;
          }>);
    const vcpmPayloadActionsForSession = await this.editActions.getByTable(
      session.sessionId,
      ENTITY_NAMES.VcpmParameterPayload,
    );
    const vcpmPayloads = this.overlay
      .applyToCollection(
        vcpmPayloadBase,
        vcpmPayloadActionsForSession,
        payload => vcpmCkvIds.includes(payload.vcpmCkvSystemId as number),
      )
      .map(result => result.effective);
    const ownedRows = [
      {targetTable: ENTITY_NAMES.SubgraphPropertyData, rows: properties},
      {targetTable: ENTITY_NAMES.VcpmParameterPayload, rows: vcpmPayloads},
      {targetTable: ENTITY_NAMES.VcpmCkv, rows: vcpmCkvs},
      {targetTable: ENTITY_NAMES.Sgkv, rows: sgkvs},
      {targetTable: ENTITY_NAMES.VcpmInstance, rows: instances},
    ];
    for (const owned of ownedRows) {
      for (const row of owned.rows as Array<{systemId: number}>) {
        await this.writer.writeDelete(
          {
            targetTable: owned.targetTable,
            targetSystemId: row.systemId,
            aggregateId: subgraphSystemId,
            ...options,
          },
          session.sessionId,
          groupId,
          this.manager,
        );
      }
    }
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.Subgraph,
        targetSystemId: subgraphSystemId,
        aggregateId: subgraphSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async getSgkvs(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<SgkvEntry[]> {
    if (sgSystemIds.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;

    const sgkvRows = await this.sgkvFetcher.fetchMany(fileSystemId, sessionId, [
      ...sgSystemIds,
    ]);
    if (sgkvRows.length === 0) return [];

    const allValueDefIds = [
      ...new Set(
        sgkvRows.flatMap(sg => sg.values.map(v => v.valueDefSystemId)),
      ),
    ];
    const valueDefs = await this.valueDefFetcher.fetchMany(
      allValueDefIds,
      sessionId,
    );
    const valueToKeyMap = new Map(
      valueDefs.map(v => [v.systemId, v.keySystemId]),
    );

    return sgkvRows.map(sgkv => ({
      sgSystemId: sgkv.subgraphSystemId,
      sgkvSystemId: sgkv.systemId,
      keyValues: sgkv.values
        .filter(v => valueToKeyMap.has(v.valueDefSystemId))
        .map(v => ({
          keyDefSystemId: valueToKeyMap.get(v.valueDefSystemId)!,
          valueDefSystemId: v.valueDefSystemId,
        })),
    }));
  }

  async getPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDefinition[]> {
    const definitions = await this.propertyDefinitionFetcher.fetchAll(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
    );
    return definitions
      .toSorted((left, right) => left.systemId - right.systemId)
      .map(
        definition =>
          new SubgraphPropertyDefinition({
            systemId: definition.systemId,
            fileSystemId: definition.fileSystemId,
            propertyId: definition.propertyId,
            name: definition.name ?? '',
            description: definition.description ?? undefined,
            maxSize: definition.maxSize,
            type: definition.propertyType,
            elementsStructure: definition.elementsStructure ?? '',
            isVoice: Boolean(definition.isVoice),
          }),
      );
  }

  async findByIds(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<Subgraph[]> {
    if (sgSystemIds.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subgraphFetcher.fetchMany(fileSystemId, sessionId, {
      systemId: [...sgSystemIds],
    });
    return rows.map(r => this.hydrate(r));
  }

  async findIsMdfInScope(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<Subgraph[]> {
    if (sgSystemIds.length === 0) return [];
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.subgraphFetcher.fetchMdfInScope(
      fileSystemId,
      sessionId,
      [...sgSystemIds],
    );
    return rows.map(r => this.hydrate(r));
  }

  async findChangedInSession(
    fileSystemId: number,
  ): Promise<SessionChanged<Subgraph>> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const changed = await this.subgraphFetcher.fetchChangedInSession(
      fileSystemId,
      sessionId,
    );
    return {
      added: changed.added.map(r => this.hydrate(r)),
      deleted: changed.deleted.map(r => this.hydrate(r)),
    };
  }

  // ── Writes ───────────────────────────────────────────────────────────────────

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
          isImported: subgraph.isImported,
          fileSystemId: subgraph.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

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

  // ── Hydration ─────────────────────────────────────────────────────────────────

  private hydrate(base: SubgraphBase): Subgraph {
    return new SubgraphEntity({
      systemId: base.systemId,
      subgraphId: base.subgraphId,
      name: base.name,
      isImported: Boolean(base.isImported),
      fileSystemId: base.fileSystemId,
    });
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
    const stagedActions = await this.editActionsSvc.getByTable(
      session.sessionId,
      ENTITY_NAMES.VcpmCkv,
    );
    const deletedCkvIds = new Set(
      stagedActions
        .filter(action => action.operation === CHANGE_OPERATION.Delete)
        .map(action => action.targetSystemId),
    );
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
      if (deletedCkvIds.has(ckv.systemId)) continue;
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

    const stagedCkvIds = stagedActions
      .filter(
        action =>
          action.operation === CHANGE_OPERATION.Create &&
          !deletedCkvIds.has(action.targetSystemId) &&
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
