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

/**
 * Database implementation of SubgraphQueryService.
 *
 * All overlay delegated to SubgraphOverlayFetcher (FR-3):
 *   applyToSubgraphs — subgraph root rows with session overlay
 *   applyToSgkvs     — SGKV (subgraph key-value bins) with session overlay
 *   fetchOne         — single subgraph with property payload rows
 *
 * Key-value pair resolution is cross-aggregate enrichment delegated to
 * KeyValueDefQueryService (FR-4). All valueDefIds from all SGKV bins across
 * all subgraphs are collected into a single batch call (FR-5 — no per-bin
 * individual calls) and the results mapped back to bins in memory.
 */
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

      const subgraphs = await this.subgraphFetcher.getSubgraphs(
        fileSystemId,
        sessionId,
      );

      // Summary — no SGKV data needed.
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

      // FullDetails — load all SGKV bins with overlay (one fetcher call).
      const allSgkvs = await this.subgraphFetcher.getSgkvs(
        fileSystemId,
        sessionId,
      );
      const sgkvsBySubgraph = new Map<number, typeof allSgkvs>();
      for (const sgkv of allSgkvs) {
        const list = sgkvsBySubgraph.get(sgkv.subgraphSystemId) ?? [];
        list.push(sgkv);
        sgkvsBySubgraph.set(sgkv.subgraphSystemId, list);
      }

      // Collect ALL valueDefIds from ALL bins across ALL subgraphs into one
      // batch — avoids per-bin individual calls (FR-5). Results are mapped
      // back to bins in memory using the valueDefId → key/value lookup below.
      const allValueDefIds = [
        ...new Set(
          allSgkvs.flatMap(sgkv => sgkv.values.map(v => v.valueDefSystemId)),
        ),
      ];

      const itemErrors: Issue[] = [];
      let kvPairsByValueId = new Map<
        number,
        {
          key: {
            systemId: number;
            keyId: number;
            name: string;
            description?: string;
          };
          value: {
            systemId: number;
            valueId: number;
            name: string;
            description?: string;
          };
        }
      >();

      if (allValueDefIds.length > 0) {
        // Single batch call for all key-value definitions (FR-4 + FR-5).
        const pairsResult =
          await this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
            allValueDefIds,
            fileSystemId,
          );
        if (pairsResult.kind === RESULT_KIND.Fail) {
          itemErrors.push(...pairsResult.issues);
        } else {
          if (pairsResult.kind === RESULT_KIND.Partial) {
            itemErrors.push(...pairsResult.issues);
          }
          // Build a per-valueDefSystemId lookup for O(1) access during assembly.
          kvPairsByValueId = new Map(
            pairsResult.data.map(pair => [pair.value.systemId, pair]),
          );
        }
      }

      // Assemble SubgraphReadModel[] in memory — no further DB calls.
      const results: SubgraphReadModel[] = subgraphs.map(s => {
        const bins = sgkvsBySubgraph.get(s.systemId) ?? [];
        const sgkvs: KeyValuePairListReadModel[] = bins.map(bin => ({
          systemId: bin.systemId,
          keyValuePairs: bin.values
            .map(v => kvPairsByValueId.get(v.valueDefSystemId))
            .filter(
              (pair): pair is NonNullable<typeof pair> => pair !== undefined,
            ),
        }));

        return {
          systemId: s.systemId,
          naturalId: s.subgraphId,
          name: s.name,
          isImported: s.isImported,
          sgkvs,
        };
      });

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
