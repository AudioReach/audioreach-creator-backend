/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  SubgraphRepository,
  IdGenerationPort,
  UnitOfWork,
  EditOptions,
  SessionChanged,
  SgkvEntry,
  KvPair,
  CreateVcpmCkvPayload,
  UpdateVcpmCalDataPayload,
  VcpmInstanceData,
} from '@arc/core';
import {
  KvData,
  Subgraph,
  SubgraphPropertyData,
  SubgraphPropertyDefinition,
  VcpmInstance,
} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../fetchers/subgraph-sgkv-fetcher.js';
import {ValueDefinitionFetcher} from '../../fetchers/definitions/key-value/value-definition-fetcher.js';
import {KeyValueDefinitionFetcher} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphBase} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import {SubgraphVcpmDataFetcher} from '../../fetchers/subgraph-vcpm-data-fetcher.js';
import {VcpmInstanceFetcher} from '../../fetchers/vcpm-instance-fetcher.js';
import {VcpmCkvFetcher} from '../../fetchers/vcpm-ckv-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';
import type {VcpmQueryContext} from '../../fetchers/vcpm-query-context.js';

export class TypeOrmSubgraphRepository implements SubgraphRepository {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;
  private readonly sgkvFetcher: SubgraphSgkvFetcher;
  private readonly valueDefFetcher: ValueDefinitionFetcher;
  private readonly keyValueDefinitionFetcher: KeyValueDefinitionFetcher;
  private readonly propertyDefinitionFetcher: SubgraphPropertyDefinitionFetcher;
  private readonly propertyDataFetcher: SubgraphPropertyDataFetcher;
  private readonly vcpmDataFetcher: SubgraphVcpmDataFetcher;
  private readonly editActionsQueryService: EditActionsQueryService;
  private readonly vcpmInstanceFetcher: VcpmInstanceFetcher;
  private readonly vcpmCkvFetcher: VcpmCkvFetcher;
  private readonly vcpmParameterPayloadFetcher: VcpmParameterPayloadFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.editActionsQueryService = editActionsQs;
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
    this.keyValueDefinitionFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsQs,
      this.valueDefFetcher,
    );
    this.propertyDefinitionFetcher = new SubgraphPropertyDefinitionFetcher(
      manager,
      editActionsQs,
    );
    this.vcpmInstanceFetcher = new VcpmInstanceFetcher(manager);
    this.vcpmCkvFetcher = new VcpmCkvFetcher(manager, this.vcpmInstanceFetcher);
    this.vcpmParameterPayloadFetcher = new VcpmParameterPayloadFetcher(manager);
    this.vcpmDataFetcher = new SubgraphVcpmDataFetcher(manager, editActionsQs);
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
            propertySystemId: prop.propertyDefinitionSystemId,
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

  async getAggregates(
    subgraphSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, Subgraph>> {
    if (subgraphSystemIds.length === 0) return new Map();
    const sessionId = this.uow.getWriteContext().session.sessionId;

    const rows = await this.subgraphFetcher.fetchMany(fileSystemId, sessionId, {
      systemId: subgraphSystemIds,
    });
    const allProperties = await this.propertyDataFetcher.fetchMany(
      rows.map(row => row.systemId),
      sessionId,
    );
    const propertiesBySubgraph = new Map<number, SubgraphPropertyDataBase[]>();
    for (const property of allProperties) {
      const properties =
        propertiesBySubgraph.get(property.subgraphSystemId) ?? [];
      properties.push(property);
      propertiesBySubgraph.set(property.subgraphSystemId, properties);
    }

    const result = new Map<number, Subgraph>();
    for (const row of rows) {
      result.set(
        row.systemId,
        this.hydrate(row, propertiesBySubgraph.get(row.systemId) ?? []),
      );
    }
    return result;
  }

  async addProperty(
    subgraphSystemId: number,
    propertySystemId: number,
    payload: Uint8Array,
  ): Promise<number> {
    const {session, groupId} = this.uow.getWriteContext();
    const systemId = await this.idGeneration.getNextId(session.fileSystemId);
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        targetSystemId: systemId,
        aggregateId: subgraphSystemId,
        payload: {subgraphSystemId, propertySystemId, payload},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    return systemId;
  }

  async rename(subgraphSystemId: number, name: string): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.Subgraph,
        targetSystemId: subgraphSystemId,
        aggregateId: subgraphSystemId,
        delta: {name},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async setPropertyData(
    subgraphSystemId: number,
    propertySystemId: number,
    data: Uint8Array,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
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
      groupId,
      this.manager,
    );
  }

  async deleteProperty(
    subgraphSystemId: number,
    propertyDataSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.SubgraphPropertyData,
        targetSystemId: propertyDataSystemId,
        aggregateId: subgraphSystemId,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  async addVcpmModule(
    instance: VcpmInstance,
    payloadSystemIdsByParameterSystemId: ReadonlyMap<number, number>,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
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
      groupId,
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
      groupId,
      this.manager,
    );

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
        groupId,
        this.manager,
      );
    }
  }

  async deleteAllVcpmData(subgraphSystemId: number): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const data = await this.vcpmDataFetcher.fetchForSubgraph(
      subgraphSystemId,
      session.sessionId,
    );
    const ownedRows = [
      {
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        rows: data.parameterPayloads,
      },
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
          groupId,
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

  async getAllVcpmData(
    subgraphSystemId: number,
    ckvSystemId?: number,
  ): Promise<VcpmInstanceData | null> {
    const {session} = this.uow.getWriteContext();
    const context: VcpmQueryContext = {
      sessionId: session.sessionId,
      editActions: await this.editActionsQueryService.getByAggregateId(
        session.sessionId,
        subgraphSystemId,
      ),
    };
    const instances = await this.vcpmInstanceFetcher.fetchMany(
      subgraphSystemId,
      session.fileSystemId,
      context,
    );
    if (instances.length === 0) return null;
    if (instances.length > 1) {
      throw new Error(
        `Expected exactly one VCPM instance for subgraph ${subgraphSystemId}, found ${instances.length}`,
      );
    }

    const ckvRows =
      ckvSystemId === undefined
        ? await this.vcpmCkvFetcher.fetchMany(
            subgraphSystemId,
            session.fileSystemId,
            context,
          )
        : await this.vcpmCkvFetcher
            .fetchOne(
              ckvSystemId,
              subgraphSystemId,
              session.fileSystemId,
              context,
            )
            .then(row => (row === null ? [] : [row]));
    const effectiveCkvSystemIds = new Set(ckvRows.map(row => row.systemId));
    const payloadRows =
      ckvSystemId === undefined || ckvRows.length === 0
        ? []
        : await this.vcpmParameterPayloadFetcher.fetchMany(
            ckvSystemId,
            subgraphSystemId,
            session.fileSystemId,
            context,
            effectiveCkvSystemIds,
          );

    const instance = new VcpmInstance({
      systemId: instances[0].systemId,
      subgraphSystemId,
      vcpmModuleDefinitionSystemId: Number(instances[0].vcpmDefinitionId),
    });
    for (const row of ckvRows) instance.addCkv(this.toKvData(row));

    return {
      instance,
      payloads: new Map(
        payloadRows.map(row => [
          row.systemId,
          Number(row.vcpmParameterSystemId),
        ]),
      ),
    };
  }

  private toKvData(row: {
    systemId: number;
    values?: Array<{valueDefSystemId: number}>;
    valueDefSystemIds?: number[];
  }): KvData {
    const valueDefSystemIds = Array.isArray(row.valueDefSystemIds)
      ? row.valueDefSystemIds
      : (row.values ?? []).map(value => value.valueDefSystemId);

    return new KvData({
      systemId: row.systemId,
      valueDefinitionSystemIds: valueDefSystemIds.map(Number),
      uiPersistence: null,
    });
  }

  async createVcpmCkv(
    subgraphSystemId: number,
    newCkvSystemId: number,
    vcpmInstanceSystemId: number,
    valueSystemIds: number[],
    payloads: CreateVcpmCkvPayload[],
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.VcpmCkv,
        targetSystemId: newCkvSystemId,
        aggregateId: subgraphSystemId,
        payload: {
          vcpmInstanceSystemId,
          valueDefSystemIds: valueSystemIds,
        },
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    for (const payload of payloads) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: payload.payloadSystemId,
          aggregateId: subgraphSystemId,
          payload: {
            vcpmCkvSystemId: newCkvSystemId,
            vcpmParameterSystemId: payload.parameterDefinitionSystemId,
            payload: payload.payload,
          },
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async deleteVcpmCkv(
    subgraphSystemId: number,
    ckvSystemId: number,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const aggregate = await this.getAllVcpmData(subgraphSystemId, ckvSystemId);
    if (aggregate === null) {
      throw new Error(
        `VCPM instance not found for subgraph ${subgraphSystemId}`,
      );
    }
    const payloads = aggregate.payloads;

    for (const payloadSystemId of payloads.keys()) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.VcpmParameterPayload,
          targetSystemId: payloadSystemId,
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

  async updateVcpmCalData(
    subgraphSystemId: number,
    updates: UpdateVcpmCalDataPayload[],
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
