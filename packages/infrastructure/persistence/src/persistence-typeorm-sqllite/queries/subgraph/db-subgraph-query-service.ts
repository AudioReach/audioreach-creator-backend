/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SubgraphQueryService,
  type SubgraphReadModel,
  type PropertyPayloadReadModel,
  type ISessionRepository,
  type KeyValueDefQueryService,
  type KeyValuePairListReadModel,
  type ConfigurationIncludes,
  type Issue,
  Result,
  ERROR_CODES,
  IssueSeverity,
  CONFIGURATION_INCLUDES,
  RESULT_KIND,
} from '@arc/core';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';

export class DbSubgraphQueryService implements SubgraphQueryService {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;

  constructor(
    dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {
    this.subgraphFetcher = new SubgraphOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async getAllSubgraphs(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SubgraphReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      const subgraphs = await this.subgraphFetcher.applyToSubgraphs(
        fileSystemId,
        sessionId,
      );

      if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
        return Result.ok(
          subgraphs.map(s => ({
            systemId: s.systemId,
            naturalId: s.subgraphId,
            name: s.name,
            isImported: s.isImported,
            sgkvs: null,
          })),
        );
      }

      const allSgkvs = await this.subgraphFetcher.applyToSgkvs(
        fileSystemId,
        sessionId,
      );
      const sgkvsBySubgraph = new Map<number, typeof allSgkvs>();
      for (const sgkv of allSgkvs) {
        const list = sgkvsBySubgraph.get(sgkv.subgraphSystemId) ?? [];
        list.push(sgkv);
        sgkvsBySubgraph.set(sgkv.subgraphSystemId, list);
      }

      const itemErrors: Issue[] = [];
      const results = await Promise.all(
        subgraphs.map(async s => {
          const bins = sgkvsBySubgraph.get(s.systemId) ?? [];
          const sgkvs: KeyValuePairListReadModel[] = [];
          for (const bin of bins) {
            const valueDefIds = bin.values.map(v => v.valueDefSystemId);
            const pairsResult =
              await this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
                valueDefIds,
                fileSystemId,
              );
            if (pairsResult.kind === RESULT_KIND.Fail) {
              itemErrors.push(...pairsResult.issues);
              continue;
            }
            if (pairsResult.kind === RESULT_KIND.Partial) {
              itemErrors.push(...pairsResult.issues);
            }
            sgkvs.push({
              systemId: bin.systemId,
              keyValuePairs: pairsResult.data,
            });
          }
          return {
            systemId: s.systemId,
            naturalId: s.subgraphId,
            name: s.name,
            isImported: s.isImported,
            sgkvs,
          } satisfies SubgraphReadModel;
        }),
      );

      return itemErrors.length > 0
        ? Result.partial(results, itemErrors)
        : Result.ok(results);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to query subgraphs',
        severity: IssueSeverity.Error,
      });
    }
  }

  async findPropertyPayloads(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const overlaid = await this.subgraphFetcher.fetchOne(
        subgraphSystemId,
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (!overlaid) return Result.ok(null);
      return Result.ok(
        overlaid.properties.map(p => ({
          systemId: p.systemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload as Uint8Array | null,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph properties',
        severity: IssueSeverity.Error,
      });
    }
  }
}
