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
  KvPair,
} from '@arc/core';
import {
  Subgraph as SubgraphEntity,
  SubgraphPropertyDefinition,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {
  SubgraphBase,
  SubgraphRow,
} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import {SubgraphVcpmDataFetcher} from '../../fetchers/subgraph-vcpm-data-fetcher.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;
  private readonly sgkvFetcher: SubgraphSgkvFetcher;
  private readonly valueDefFetcher: ValueDefinitionFetcher;
  private readonly keyValueDefinitionFetcher: KeyValueDefinitionFetcher;
  private readonly propertyDefinitionFetcher: SubgraphPropertyDefinitionFetcher;
  private readonly vcpmDataFetcher: SubgraphVcpmDataFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.sgkvFetcher = new SubgraphSgkvFetcher(manager, editActionsQs);
    const propertyDataFetcher = new SubgraphPropertyDataFetcher(
      manager,
      editActionsQs,
    );
    this.subgraphFetcher = new SubgraphOverlayFetcher(
      manager,
      editActionsQs,
      propertyDataFetcher,
      this.sgkvFetcher,
    );
    this.valueDefFetcher = new ValueDefinitionFetcher(manager, editActionsQs);
    this.keyValueDefinitionFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsQs,
      this.valueDefFetcher,
    );
    this.propertyDefinitionFetcher = new SubgraphPropertyDefinitionFetcher(
      manager,
      editActionsQs,
    );
    this.vcpmDataFetcher = new SubgraphVcpmDataFetcher(manager, editActionsQs);
  }

  async findSubgraphFileSystemId(systemId: number): Promise<number | null> {
    const row = await this.manager
      .getRepository<SubgraphRow>(ENTITY_NAMES.Subgraph)
      .findOne({where: {systemId}});
    return row?.fileSystemId ?? null;
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

    const [sgkvs, vcpmData] = await Promise.all([
      this.sgkvFetcher.fetchMany(session.fileSystemId, session.sessionId, [
        subgraphSystemId,
      ]),
      this.vcpmDataFetcher.fetchForSubgraph(
        subgraphSystemId,
        session.sessionId,
      ),
    ]);
    const ownedRows = [
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        rows: subgraph.properties,
      },
      {
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        rows: vcpmData.parameterPayloads,
      },
      {targetTable: ENTITY_NAMES.VcpmCkv, rows: vcpmData.ckvs},
      {targetTable: ENTITY_NAMES.Sgkv, rows: sgkvs},
      {targetTable: ENTITY_NAMES.VcpmInstance, rows: vcpmData.instances},
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

  async resolveKeyValues(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<KvPair[]> {
    const requestedIds = [...new Set(valueDefSystemIds)].sort(
      (left, right) => left - right,
    );
    if (requestedIds.length === 0) return [];

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const keyDefinitions = await this.keyValueDefinitionFetcher.fetchMany(
      'all',
      fileSystemId,
      sessionId,
      undefined,
      {systemId: requestedIds},
    );
    const requestedIdSet = new Set(requestedIds);
    const pairs: KvPair[] = [];
    for (const keyDefinition of keyDefinitions) {
      for (const valueDefinition of keyDefinition.values) {
        if (requestedIdSet.has(valueDefinition.systemId)) {
          pairs.push({
            keyDefSystemId: keyDefinition.systemId,
            valueDefSystemId: valueDefinition.systemId,
          });
        }
      }
    }
    return pairs.toSorted(
      (left, right) => left.valueDefSystemId - right.valueDefSystemId,
    );
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
            naturalId: definition.naturalId,
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

  async getUsecaseSystemIdForSubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<number | null> {
    const row = await this.manager
      .createQueryBuilder()
      .select('ucs.usecase_system_id', 'usecaseSystemId')
      .from(ENTITY_NAMES.UseCaseSubgraph, 'ucs')
      .innerJoin(
        ENTITY_NAMES.UseCase,
        'uc',
        'uc.systemId = ucs.usecaseSystemId AND uc.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where('ucs.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
      .getRawOne<{usecaseSystemId: number}>();
    return row ? Number(row.usecaseSystemId) : null;
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
          naturalId: subgraph.naturalId,
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
          targetSystemId: prop.systemId,
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
      naturalId: base.naturalId,
      name: base.name,
      isImported: Boolean(base.isImported),
      fileSystemId: base.fileSystemId,
    });
  }
}
