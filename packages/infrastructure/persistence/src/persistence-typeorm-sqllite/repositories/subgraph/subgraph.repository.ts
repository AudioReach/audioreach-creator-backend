/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BatchRead,
  SubgraphRepository,
  IdGenerationPort,
  UnitOfWork,
  EditOptions,
  SessionChanged,
  SubgraphPropertyPayloadsReadModel,
  SubgraphReadModel,
  ConfigurationIncludes,
  VcpmAggregateOptions,
  VcpmAggregateReadModel,
  VcpmInstance,
} from '@arc/core';
import {
  ENTITY_TYPE,
  Subgraph,
  SubgraphPropertyData,
  SubgraphPropertyDefinition,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import {SubgraphVcpmDataFetcher} from '../../fetchers/subgraph-vcpm-data-fetcher.js';
import type {DbSubgraphQueryService} from '../../queries/subgraph/db-subgraph-query-service.js';
import {createSubgraphQueryService} from '../../queries/subgraph/create-subgraph-query-service.js';
import {withNotFound} from '../../utils/with-not-found.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;
  private readonly propertyDefinitionFetcher: SubgraphPropertyDefinitionFetcher;
  private readonly vcpmDataFetcher: SubgraphVcpmDataFetcher;
  /** Query reads, run on the unit-of-work manager. */
  private readonly queries: DbSubgraphQueryService;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.subgraphFetcher = new SubgraphOverlayFetcher(
      manager,
      editActionsQs,
      new SubgraphPropertyDataFetcher(manager, editActionsQs),
      new SubgraphSgkvFetcher(manager, editActionsQs),
    );
    this.propertyDefinitionFetcher = new SubgraphPropertyDefinitionFetcher(
      manager,
      editActionsQs,
    );
    this.vcpmDataFetcher = new SubgraphVcpmDataFetcher(manager, editActionsQs);
    this.queries = createSubgraphQueryService(manager);
  }

  // ── Query reads (SubgraphQueryService) ──────────────────────────────────────

  findSubgraphs(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
    includes: ConfigurationIncludes,
  ): Promise<BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>> {
    return this.queries.findSubgraphs(
      fileSystemId,
      subgraphSystemIds,
      includes,
    );
  }

  findAllSubgraphs(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>> {
    return this.queries.findAllSubgraphs(fileSystemId, includes);
  }

  findSubgraphPropertyPayloads(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<
    BatchRead<SubgraphPropertyPayloadsReadModel, typeof ENTITY_TYPE.Subgraph>
  > {
    return this.queries.findSubgraphPropertyPayloads(
      fileSystemId,
      subgraphSystemIds,
    );
  }

  findVcpmAggregate(
    fileSystemId: number,
    subgraphSystemId: number,
    options?: VcpmAggregateOptions,
  ): Promise<VcpmAggregateReadModel> {
    return this.queries.findVcpmAggregate(
      fileSystemId,
      subgraphSystemId,
      options,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async nameExists(
    name: string,
    fileSystemId: number,
    excludedSubgraphSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const subgraphs = await this.subgraphFetcher.fetchMany(
      fileSystemId,
      sessionId,
      {name},
    );
    return subgraphs.some(
      subgraph => subgraph.systemId !== excludedSubgraphSystemId,
    );
  }

  async deleteSubgraph(
    subgraphSystemId: number,
    _fileSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const subgraph = await this.subgraphFetcher.fetchOne(
      subgraphSystemId,
      session.fileSystemId,
      session.sessionId,
    );
    if (!subgraph) return;

    const [sgkvs, vcpmData] = await Promise.all([
      this.subgraphFetcher.getSgkvs(session.fileSystemId, session.sessionId, [
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
      {targetTable: ENTITY_NAMES.VcpmCkvValues, rows: vcpmData.values},
      {targetTable: ENTITY_NAMES.VcpmCkv, rows: vcpmData.ckvs},
      {
        targetTable: ENTITY_NAMES.SgkvValues,
        rows: sgkvs.flatMap(sgkv => sgkv.values),
      },
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
      this.manager,
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
    const {session} = this.uow.getWriteContext();

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
            propertySystemId: prop.propertyDefinitionSystemId,
            payload: prop.getPayloadCopy() ?? null,
          },
          ...options,
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async findSubgraphAggregates(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<BatchRead<Subgraph, typeof ENTITY_TYPE.Subgraph>> {
    const requestedIds = [...new Set(subgraphSystemIds)];
    const rows = await this.subgraphFetcher.fetchManyWithProperties(
      fileSystemId,
      this.uow.getWriteContext().session.sessionId,
      requestedIds,
    );
    const byId = new Map(rows.map(row => [row.systemId, row]));
    const items = requestedIds
      .map(id => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map(row => this.hydrate(row, row.properties));
    return withNotFound(
      ENTITY_TYPE.Subgraph,
      requestedIds,
      items,
      subgraph => subgraph.systemId,
    );
  }

  async addProperty(
    subgraphSystemId: number,
    propertySystemId: number,
    payload: Uint8Array,
  ): Promise<number> {
    const {session} = this.uow.getWriteContext();
    const systemId = await this.idGeneration.getNextId(session.fileSystemId);
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        targetSystemId: systemId,
        aggregateId: subgraphSystemId,
        payload: {subgraphSystemId, propertySystemId, payload},
      },
      session.sessionId,
      this.manager,
    );
    return systemId;
  }

  async rename(subgraphSystemId: number, name: string): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Subgraph,
        targetSystemId: subgraphSystemId,
        aggregateId: subgraphSystemId,
        delta: {name},
      },
      session.sessionId,
      this.manager,
    );
  }

  async setPropertyData(
    subgraphSystemId: number,
    propertySystemId: number,
    data: Uint8Array,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const subgraph = await this.subgraphFetcher.fetchOne(
      subgraphSystemId,
      session.fileSystemId,
      session.sessionId,
    );
    const prop = subgraph?.properties.find(
      row => row.propertySystemId === propertySystemId,
    );
    if (!prop) {
      throw new Error(
        `SubgraphPropertyData for property ${propertySystemId} not found on subgraph ${subgraphSystemId}.`,
      );
    }
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        targetSystemId: prop.systemId,
        aggregateId: subgraphSystemId,
        delta: {payload: data},
      },
      session.sessionId,
      this.manager,
    );
  }

  async deleteProperty(
    subgraphSystemId: number,
    propertyDataSystemId: number,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        targetSystemId: propertyDataSystemId,
        aggregateId: subgraphSystemId,
      },
      session.sessionId,
      this.manager,
    );
  }

  async addVcpmModule(
    instance: VcpmInstance,
    payloadSystemIdsByParameterSystemId: ReadonlyMap<number, number>,
  ): Promise<void> {
    const {session} = this.uow.getWriteContext();
    if (instance.ckvs.length !== 1) {
      throw new Error(
        `Expected exactly one CKV for VCPM instance ${instance.systemId}`,
      );
    }
    const [ckv] = instance.ckvs;

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.VcpmInstance,
        targetSystemId: instance.systemId,
        aggregateId: instance.subgraphSystemId,
        payload: {
          subgraphSystemId: instance.subgraphSystemId,
          vcpmDefinitionId: instance.vcpmModuleDefinitionSystemId,
        },
      },
      session.sessionId,
      this.manager,
    );

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.VcpmCkv,
        targetSystemId: ckv.systemId,
        aggregateId: instance.subgraphSystemId,
        payload: {vcpmInstanceSystemId: instance.systemId},
      },
      session.sessionId,
      this.manager,
    );

    for (const valueDefSystemId of ckv.valueDefinitionSystemIds) {
      const relationshipSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmCkvValues,
          targetSystemId: relationshipSystemId,
          aggregateId: instance.subgraphSystemId,
          payload: {vcpmCkvSystemId: ckv.systemId, valueDefSystemId},
        },
        session.sessionId,
        this.manager,
      );
    }

    for (const parameter of ckv.parameterPayloads) {
      const payloadSystemId = payloadSystemIdsByParameterSystemId.get(
        parameter.paramDefintionSystemId,
      );
      if (payloadSystemId === undefined) {
        throw new Error(
          `Missing VCPM payload system ID for parameter ${parameter.paramDefintionSystemId}`,
        );
      }
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: payloadSystemId,
          aggregateId: instance.subgraphSystemId,
          payload: {
            vcpmCkvSystemId: ckv.systemId,
            vcpmParameterSystemId: parameter.paramDefintionSystemId,
            payload: parameter.getPayloadCopy(),
          },
        },
        session.sessionId,
        this.manager,
      );
    }
  }

  async deleteAllVcpmData(subgraphSystemId: number): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const data = await this.vcpmDataFetcher.fetchForSubgraph(
      subgraphSystemId,
      session.sessionId,
    );
    const ownedRows = [
      {
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        rows: data.parameterPayloads,
      },
      {targetTable: ENTITY_NAMES.VcpmCkvValues, rows: data.values},
      {targetTable: ENTITY_NAMES.VcpmCkv, rows: data.ckvs},
      {targetTable: ENTITY_NAMES.VcpmInstance, rows: data.instances},
    ];
    for (const owned of ownedRows) {
      for (const row of owned.rows) {
        await this.writer.writeDelete(
          {
            targetTable: owned.targetTable,
            targetSystemId: row.systemId,
            aggregateId: subgraphSystemId,
          },
          session.sessionId,
          this.manager,
        );
      }
    }
  }

  private hydrate(
    base: SubgraphBase,
    properties: readonly SubgraphPropertyDataBase[] = [],
  ): Subgraph {
    return new Subgraph({
      systemId: base.systemId,
      naturalId: base.naturalId,
      name: base.name,
      isImported: Boolean(base.isImported),
      fileSystemId: base.fileSystemId,
      properties: properties.map(
        property =>
          new SubgraphPropertyData(
            property.systemId,
            property.propertySystemId,
            property.payload,
          ),
      ),
    });
  }
}
