/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import type {SubgraphBase} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {VcpmQueryContext} from '../../fetchers/vcpm-query-context.js';
import type {VcpmCkvFetcher} from '../../fetchers/vcpm-ckv-fetcher.js';
import type {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';
import type {VcpmModuleParameterDefinitionFetcher} from '../../fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import type {VcpmCkvBase} from '../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {inRequestOrder} from '../../utils/in-request-order.js';
import {
  type BatchRead,
  type FailedEntity,
  type IdentifiedEntityRef,
  type KeyValueDefQueryService,
  type KeyValuePairListReadModel,
  type SubgraphPropertyPayloadsReadModel,
  type SubgraphQueryService,
  type SubgraphReadModel,
  type ConfigurationIncludes,
  type VcpmAggregateOptions,
  type VcpmAggregateReadModel,
  type VcpmCkvReadModel,
  CONFIGURATION_INCLUDES,
  FAILED_ENTITY_REASON,
  ENTITY_TYPE,
} from '@arc/core';

type SubgraphBatch = BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>;

/**
 * Database implementation of SubgraphQueryService. Reads run on the given
 * EntityManager with the file's active session overlay; built by
 * `createSubgraphQueryService`.
 */
export class DbSubgraphQueryService implements SubgraphQueryService {
  constructor(
    private readonly manager: EntityManager,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
    private readonly subgraphFetcher: SubgraphOverlayFetcher,
    private readonly editActionsQuerySvc: EditActionsQueryService,
    private readonly vcpmCkvFetcher: VcpmCkvFetcher,
    private readonly parameterPayloadFetcher: VcpmParameterPayloadFetcher,
    private readonly parameterDefinitionFetcher: VcpmModuleParameterDefinitionFetcher,
  ) {}

  async findSubgraphs(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
    includes: ConfigurationIncludes,
  ): Promise<SubgraphBatch> {
    const requestedIds = [...new Set(subgraphSystemIds)];
    if (requestedIds.length === 0)
      return {entityType: ENTITY_TYPE.Subgraph, items: [], failed: []};
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const rows = await this.subgraphFetcher.fetchMany(fileSystemId, sessionId, {
      systemId: requestedIds,
    });
    const read = await this.toReadModels(
      fileSystemId,
      sessionId,
      inRequestOrder(requestedIds, rows),
      includes,
    );
    return withNotFound(
      ENTITY_TYPE.Subgraph,
      requestedIds,
      read.items,
      subgraph => subgraph.systemId,
      read.failed,
    );
  }

  async findSubgraphIdentities(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Subgraph>,
      typeof ENTITY_TYPE.Subgraph
    >
  > {
    const requestedIds = [...new Set(subgraphSystemIds)];
    if (requestedIds.length === 0)
      return {entityType: ENTITY_TYPE.Subgraph, items: [], failed: []};
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const rows = await this.subgraphFetcher.fetchMany(fileSystemId, sessionId, {
      systemId: requestedIds,
    });
    const items = inRequestOrder(requestedIds, rows).map(row => ({
      entityType: ENTITY_TYPE.Subgraph,
      systemId: row.systemId,
      identity: {name: row.name, naturalId: row.naturalId},
    }));
    return withNotFound(
      ENTITY_TYPE.Subgraph,
      requestedIds,
      items,
      item => item.systemId,
    );
  }

  async findAllSubgraphs(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<SubgraphBatch> {
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const rows = await this.subgraphFetcher.fetchMany(fileSystemId, sessionId);
    return this.toReadModels(fileSystemId, sessionId, rows, includes);
  }

  async findSubgraphPropertyPayloads(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<
    BatchRead<SubgraphPropertyPayloadsReadModel, typeof ENTITY_TYPE.Subgraph>
  > {
    const requestedIds = [...new Set(subgraphSystemIds)];
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const subgraphs = await this.subgraphFetcher.fetchManyWithProperties(
      fileSystemId,
      sessionId,
      requestedIds,
    );
    const items = inRequestOrder(requestedIds, subgraphs).map(subgraph => ({
      subgraphSystemId: subgraph.systemId,
      properties: subgraph.properties.map(property => ({
        systemId: property.systemId,
        propertySystemId: property.propertySystemId,
        payload: property.payload,
      })),
    }));
    return withNotFound(
      ENTITY_TYPE.Subgraph,
      requestedIds,
      items,
      item => item.subgraphSystemId,
    );
  }

  /**
   * `SUMMARY` maps the rows as they are. `FULL_DETAILS` resolves every SGKV
   * value with one key/value read; a subgraph with an unresolved value is
   * reported as `UNRESOLVED_REFERENCE` instead of returned without it.
   */
  private async toReadModels(
    fileSystemId: number,
    sessionId: number | null,
    rows: readonly SubgraphBase[],
    includes: ConfigurationIncludes,
  ): Promise<SubgraphBatch> {
    if (includes === CONFIGURATION_INCLUDES.Summary) {
      return {
        entityType: ENTITY_TYPE.Subgraph,
        items: rows.map(row => toReadModel(row, null)),
        failed: [],
      };
    }
    if (rows.length === 0)
      return {entityType: ENTITY_TYPE.Subgraph, items: [], failed: []};

    const sgkvRows = await this.subgraphFetcher.getSgkvs(
      fileSystemId,
      sessionId,
      rows.map(row => row.systemId),
    );
    const sgkvsBySubgraph = new Map<number, typeof sgkvRows>();
    for (const sgkv of sgkvRows) {
      const list = sgkvsBySubgraph.get(sgkv.subgraphSystemId) ?? [];
      list.push(sgkv);
      sgkvsBySubgraph.set(sgkv.subgraphSystemId, list);
    }

    const pairs = await this.keyValueDefSvc.findKeyValuePairs(fileSystemId, [
      ...new Set(
        sgkvRows.flatMap(sgkv => sgkv.values.map(v => v.valueDefSystemId)),
      ),
    ]);
    const pairByValueId = new Map(
      pairs.items.map(pair => [pair.value.systemId, pair]),
    );

    const items: SubgraphReadModel[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.Subgraph>[] = [];
    for (const row of rows) {
      const bins = sgkvsBySubgraph.get(row.systemId) ?? [];
      const missingValueId = bins
        .flatMap(bin => bin.values)
        .map(value => value.valueDefSystemId)
        .find(valueId => !pairByValueId.has(valueId));
      if (missingValueId !== undefined) {
        failed.push({
          systemId: row.systemId,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          identity: {name: row.name, naturalId: row.naturalId},
          missingRef: {
            entityType: ENTITY_TYPE.ValueDefinition,
            systemId: missingValueId,
          },
        });
        continue;
      }
      const sgkvs: KeyValuePairListReadModel[] = bins.map(bin => ({
        systemId: bin.systemId,
        keyValuePairs: bin.values.map(
          value => pairByValueId.get(value.valueDefSystemId)!,
        ),
      }));
      items.push(toReadModel(row, sgkvs));
    }
    return {entityType: ENTITY_TYPE.Subgraph, items, failed};
  }

  async findVcpmAggregate(
    fileSystemId: number,
    subgraphSystemId: number,
    options: VcpmAggregateOptions = {},
  ): Promise<VcpmAggregateReadModel> {
    const sessionId = await resolveActiveSessionId(this.manager, fileSystemId);
    const context: VcpmQueryContext = {
      sessionId,
      editActions:
        sessionId === null
          ? []
          : await this.editActionsQuerySvc.getByAggregateId(
              sessionId,
              subgraphSystemId,
            ),
    };

    const selectedCkv =
      options.ckvSystemId === undefined
        ? null
        : await this.vcpmCkvFetcher.fetchOne(
            options.ckvSystemId,
            subgraphSystemId,
            fileSystemId,
            context,
          );
    let ckvRows: VcpmCkvBase[];
    if (options.ckvSystemId === undefined) {
      ckvRows = await this.vcpmCkvFetcher.fetchMany(
        subgraphSystemId,
        fileSystemId,
        context,
      );
    } else if (selectedCkv === null) {
      ckvRows = [];
    } else {
      ckvRows = [selectedCkv];
    }
    const effectiveCkvSystemIds = new Set(ckvRows.map(ckv => ckv.systemId));

    const [ckvs, linkRows] = await Promise.all([
      this.resolveVcpmCkvValues(ckvRows, fileSystemId),
      options.ckvSystemId === undefined
        ? this.parameterPayloadFetcher.fetchParameterCkvLinksBySubgraph(
            subgraphSystemId,
            fileSystemId,
            context,
            effectiveCkvSystemIds,
          )
        : Promise.resolve([]),
    ]);

    const linksByParameter = new Map<number, Set<number>>();
    for (const link of linkRows) {
      const ckvIds =
        linksByParameter.get(link.parameterSystemId) ?? new Set<number>();
      ckvIds.add(link.ckvSystemId);
      linksByParameter.set(link.parameterSystemId, ckvIds);
    }

    const payloadRows =
      options.ckvSystemId === undefined || selectedCkv === null
        ? []
        : await this.parameterPayloadFetcher.fetchMany(
            options.ckvSystemId,
            subgraphSystemId,
            fileSystemId,
            context,
            effectiveCkvSystemIds,
            options.paramSystemIds,
          );
    const payloads = payloadRows.map(row => ({
      systemId: row.systemId,
      vcpmParameterSystemId: row.vcpmParameterSystemId,
      vcpmCkvSystemId: row.vcpmCkvSystemId,
      payload: new Uint8Array(row.payload),
    }));

    const parameterSystemIds = [
      ...new Set([
        ...linkRows.map(row => row.parameterSystemId),
        ...payloads.map(row => row.vcpmParameterSystemId),
      ]),
    ];
    const definitionRows = await this.parameterDefinitionFetcher.fetchMany(
      parameterSystemIds,
      fileSystemId,
    );

    return {
      ckvs,
      parameterCkvLinks: [...linksByParameter].map(
        ([parameterSystemId, ckvSystemIds]) => ({
          parameterSystemId,
          ckvSystemIds: [...ckvSystemIds],
        }),
      ),
      payloads,
      parameterDefinitions: definitionRows.map(row => ({
        systemId: row.systemId,
        paramId: row.paramId,
        name: row.name ?? '',
        isReadOnly: row.isReadOnly,
        elementsStructure: row.elementsStructure ?? '',
      })),
    };
  }

  private async resolveVcpmCkvValues(
    rows: Array<{
      systemId: number;
      values: Array<{valueDefSystemId: number}>;
    }>,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel[]> {
    if (rows.length === 0) return [];

    const valueDefIds = [
      ...new Set(
        rows.flatMap(row => row.values.map(value => value.valueDefSystemId)),
      ),
    ];
    if (valueDefIds.length === 0) {
      return rows.map(row => ({systemId: row.systemId, values: []}));
    }

    // A CKV is only usable with all its values; a missing one throws below.
    const result = await this.keyValueDefSvc.findKeyValuePairs(
      fileSystemId,
      valueDefIds,
    );
    const pairs = new Map(
      result.items.map(pair => [
        pair.value.systemId,
        {
          key: {
            naturalId: pair.key.naturalId,
            name: pair.key.name,
            systemId: String(pair.key.systemId),
          },
          value: {
            naturalId: pair.value.naturalId,
            name: pair.value.name,
            systemId: String(pair.value.systemId),
          },
        },
      ]),
    );

    return rows.map(row => ({
      systemId: row.systemId,
      values: row.values.map(value => {
        const pair = pairs.get(value.valueDefSystemId);
        if (pair === undefined) {
          throw new Error('Missing value definition ' + value.valueDefSystemId);
        }
        return pair;
      }),
    }));
  }
}

function toReadModel(
  row: SubgraphBase,
  sgkvs: KeyValuePairListReadModel[] | null,
): SubgraphReadModel {
  return {
    systemId: row.systemId,
    naturalId: row.naturalId,
    name: row.name,
    isImported: row.isImported,
    sgkvs,
  };
}
