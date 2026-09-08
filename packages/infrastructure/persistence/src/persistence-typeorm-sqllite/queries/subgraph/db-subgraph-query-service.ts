/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';
import type {VcpmCkvFetcher} from '../../fetchers/vcpm-ckv-fetcher.js';
import type {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';
import type {VcpmModuleParameterDefinitionFetcher} from '../../fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import type {VcpmCkvBase} from '../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import {
  type SubgraphQueryService,
  type SubgraphReadModel,
  type PropertyPayloadReadModel,
  type ISessionRepository,
  type KeyValueDefQueryService,
  type KeyValuePairListReadModel,
  type ConfigurationIncludes,
  type Issue,
  type VcpmAggregateOptions,
  type VcpmAggregateReadModel,
  type VcpmCkvReadModel,
  Result,
  ERROR_CODES,
  IssueSeverity,
  CONFIGURATION_INCLUDES,
  RESULT_KIND,
} from '@arc/core';

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
    private readonly sessionRepo: ISessionRepository,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
    subgraphFetcher: SubgraphOverlayFetcher,
    private readonly vcpmCkvFetcher: VcpmCkvFetcher,
    private readonly parameterPayloadFetcher: VcpmParameterPayloadFetcher,
    private readonly parameterDefinitionFetcher: VcpmModuleParameterDefinitionFetcher,
  ) {
    this.subgraphFetcher = subgraphFetcher;
  }

  async getAllSubgraphs(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SubgraphReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      const subgraphs = await this.subgraphFetcher.fetchMany(
        fileSystemId,
        sessionId,
      );

      // Summary — no SGKV data needed.
      if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
        return Result.ok(
          subgraphs.map(s => ({
            systemId: s.systemId,
            naturalId: s.naturalId,
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
            naturalId: number;
            name: string;
            description?: string;
          };
          value: {
            systemId: number;
            naturalId: number;
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
          naturalId: s.naturalId,
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
          payload: p.payload,
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

  async getVcpmAggregateBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    options: VcpmAggregateOptions = {},
  ): Promise<Result<VcpmAggregateReadModel>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const sessionId = session?.sessionId ?? null;

      const selectedCkv =
        options.ckvSystemId === undefined
          ? null
          : await this.vcpmCkvFetcher.fetchOne(
              options.ckvSystemId,
              subgraphSystemId,
              fileSystemId,
              sessionId,
            );
      let ckvRows: VcpmCkvBase[];
      if (options.ckvSystemId === undefined) {
        ckvRows = await this.vcpmCkvFetcher.fetchMany(
          subgraphSystemId,
          fileSystemId,
          sessionId,
        );
      } else if (selectedCkv === null) {
        ckvRows = [];
      } else {
        ckvRows = [selectedCkv];
      }
      const effectiveCkvSystemIds = new Set(ckvRows.map(ckv => ckv.systemId));

      const [ckvs, linkRows] = await Promise.all([
        this.resolveVcpmCkvValues(ckvRows, fileSystemId),
        this.parameterPayloadFetcher.fetchParameterCkvLinksBySubgraph(
          subgraphSystemId,
          fileSystemId,
          sessionId,
          effectiveCkvSystemIds,
        ),
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
              sessionId,
              effectiveCkvSystemIds,
              options.paramSystemIds,
            );
      const payloads = payloadRows.map(row => ({
        systemId: row.systemId,
        vcpmParameterSystemId: row.vcpmParameterSystemId,
        vcpmCkvSystemId: row.vcpmCkvSystemId,
        payload: row.payload === null ? null : new Uint8Array(row.payload),
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

      return Result.ok({
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
      });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to query VCPM aggregate',
        severity: IssueSeverity.Error,
      });
    }
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

    const result = await this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
      valueDefIds,
      fileSystemId,
    );
    if (result.kind === RESULT_KIND.Fail) {
      throw new Error('Failed to resolve CKV values for file ' + fileSystemId);
    }

    const pairs = new Map(
      result.data.map(pair => [
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
