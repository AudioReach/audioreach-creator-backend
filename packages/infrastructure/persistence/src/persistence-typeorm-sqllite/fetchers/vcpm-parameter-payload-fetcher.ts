/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  VcpmParameterPayloadBase as SchemaVcpmParameterPayloadBase,
  VcpmParameterPayloadRow,
} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmQueryContext} from './vcpm-query-context.js';
import {
  applyEntityFilters,
  matchesEntityFilters,
} from '../queries/shared/filter-utils.js';

export interface VcpmParameterPayloadBase {
  readonly systemId: number;
  readonly vcpmParameterSystemId: number;
  readonly vcpmCkvSystemId: number;
  readonly payload: Uint8Array;
}

export interface VcpmParameterCkvLinkRow {
  parameterSystemId: number;
  ckvSystemId: number;
}

export type VcpmParameterPayloadFilters = {
  systemId?: number | number[];
  vcpmParameterSystemId?: number | number[];
  vcpmCkvSystemId?: number | number[];
  $or?: VcpmParameterPayloadFilters[];
};

type RawParameterCkvLinkRow = Pick<
  SchemaVcpmParameterPayloadBase,
  'systemId' | 'vcpmParameterSystemId' | 'vcpmCkvSystemId'
>;

/**
 * Loads VCPM parameter payloads and applies the subgraph edit-session overlay.
 *
 * The fetcher supports both VCPM read paths:
 * - PR #124 aggregate reads use VcpmQueryContext and explicit file/CKV scope.
 * - Set-CKV command-side reads use a session ID and aggregate-level filters.
 */
export class VcpmParameterPayloadFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc?: EditActionsQueryService,
  ) {}

  async fetchParameterCkvLinksBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
    effectiveCkvSystemIds: ReadonlySet<number>,
  ): Promise<VcpmParameterCkvLinkRow[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .select(['pp.systemId', 'pp.vcpmParameterSystemId', 'pp.vcpmCkvSystemId'])
      .getMany()) as unknown as RawParameterCkvLinkRow[];

    const scopedRows = baseRows.filter(row =>
      effectiveCkvSystemIds.has(row.vcpmCkvSystemId),
    );
    if (context.sessionId === null) return this.toLinks(scopedRows);

    const payloadActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      {
        matchesEffective: row =>
          effectiveCkvSystemIds.has(Number(row.vcpmCkvSystemId)),
      },
    );

    return this.toLinks(effectiveRows.map(row => row.effective));
  }

  async fetchMany(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
    filters?: VcpmParameterPayloadFilters,
  ): Promise<VcpmParameterPayloadBase[]>;

  async fetchMany(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
    effectiveCkvSystemIds: ReadonlySet<number>,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]>;

  async fetchMany(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemIdOrSessionId: number | null,
    contextOrFilters?: VcpmQueryContext | VcpmParameterPayloadFilters,
    effectiveCkvSystemIds?: ReadonlySet<number>,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]> {
    if (isVcpmQueryContext(contextOrFilters)) {
      if (
        fileSystemIdOrSessionId === null ||
        effectiveCkvSystemIds === undefined
      ) {
        return [];
      }
      return this.fetchManyForReadAggregate(
        ckvSystemId,
        subgraphSystemId,
        fileSystemIdOrSessionId,
        contextOrFilters,
        effectiveCkvSystemIds,
        paramSystemIds,
      );
    }

    return this.fetchManyForWriteAggregate(
      ckvSystemId,
      subgraphSystemId,
      fileSystemIdOrSessionId,
      contextOrFilters,
    );
  }

  private async fetchManyForReadAggregate(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    context: VcpmQueryContext,
    effectiveCkvSystemIds: ReadonlySet<number>,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]> {
    if (!effectiveCkvSystemIds.has(ckvSystemId)) return [];

    const payloadQuery = this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .where('pp.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId});

    if (paramSystemIds !== undefined && paramSystemIds.length > 0) {
      payloadQuery.andWhere(
        'pp.vcpmParameterSystemId IN (:...paramSystemIds)',
        {paramSystemIds},
      );
    }

    const baseRows =
      (await payloadQuery.getMany()) as unknown as VcpmParameterPayloadBase[];

    const matchesParameterFilter = (parameterSystemId: number): boolean =>
      paramSystemIds === undefined ||
      paramSystemIds.length === 0 ||
      paramSystemIds.includes(parameterSystemId);

    if (context.sessionId === null) {
      return baseRows.filter(row =>
        matchesParameterFilter(row.vcpmParameterSystemId),
      );
    }

    const payloadActions = context.editActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      {
        matchesEffective: row =>
          Number(row.vcpmCkvSystemId) === ckvSystemId &&
          effectiveCkvSystemIds.has(Number(row.vcpmCkvSystemId)) &&
          matchesParameterFilter(Number(row.vcpmParameterSystemId)),
      },
    );

    return effectiveRows.map(row => row.effective);
  }

  private async fetchManyForWriteAggregate(
    ckvSystemId: number,
    subgraphSystemId: number,
    sessionId: number | null,
    filters?: VcpmParameterPayloadFilters,
  ): Promise<VcpmParameterPayloadBase[]> {
    const aggregateActions =
      sessionId === null
        ? []
        : await this.getAggregateActions(sessionId, subgraphSystemId);
    const payloadActions = aggregateActions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );

    const query = this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId});
    if (sessionId === null && filters) {
      applyEntityFilters(query, 'payload', filters);
    }

    const baseRows = (await query.getMany()) as VcpmParameterPayloadRow[];
    const base = baseRows.map(row => this.toBase(row));

    if (sessionId === null || payloadActions.length === 0) {
      return this.filterPayloads(base, filters);
    }

    return this.overlay
      .applyToCollection(base, payloadActions, {
        matchesEffective: newValue =>
          Number(newValue.vcpmCkvSystemId) === ckvSystemId &&
          (filters === undefined || matchesEntityFilters(newValue, filters)),
      })
      .map(result => result.effective);
  }

  private async getAggregateActions(sessionId: number, aggregateId: number) {
    if (this.editActionsSvc === undefined) {
      throw new Error(
        'EditActionsQueryService is required for session-scoped payload reads',
      );
    }
    return this.editActionsSvc.getByAggregateId(sessionId, aggregateId);
  }

  private toBase(row: VcpmParameterPayloadRow): VcpmParameterPayloadBase {
    return {
      systemId: row.systemId,
      vcpmParameterSystemId: row.vcpmParameterSystemId,
      vcpmCkvSystemId: row.vcpmCkvSystemId,
      payload: row.payload,
    };
  }

  private toLinks(
    rows: Array<{
      vcpmParameterSystemId: number;
      vcpmCkvSystemId: number;
    }>,
  ): VcpmParameterCkvLinkRow[] {
    return rows.map(row => ({
      parameterSystemId: row.vcpmParameterSystemId,
      ckvSystemId: row.vcpmCkvSystemId,
    }));
  }

  private filterPayloads(
    payloads: VcpmParameterPayloadBase[],
    filters: VcpmParameterPayloadFilters | undefined,
  ): VcpmParameterPayloadBase[] {
    return filters === undefined
      ? payloads
      : payloads.filter(payload =>
          matchesEntityFilters(
            payload as unknown as Record<string, unknown>,
            filters,
          ),
        );
  }
}

function isVcpmQueryContext(
  value: VcpmQueryContext | VcpmParameterPayloadFilters | undefined,
): value is VcpmQueryContext {
  return value !== undefined && 'sessionId' in value && 'editActions' in value;
}
