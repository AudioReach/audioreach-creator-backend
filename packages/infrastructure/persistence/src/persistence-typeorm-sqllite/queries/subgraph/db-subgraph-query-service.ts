/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): findActiveSession pending read-service rewrite */

import type {DataSource} from 'typeorm';
import {
  type SubgraphQueryService,
  type SubgraphReadModel,
  type KeyValuePairListReadModel,
  type KeyValuePairReadModel,
  type KeyValueDefQueryService,
  type ConfigurationIncludes,
  type Issue,
  Result,
  ERROR_CODES,
  CONFIGURATION_INCLUDES,
  RESULT_KIND,
  IssueSeverity,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ProjectSessionRow} from '../../entity-schema/index.js';
import type {SubgraphRow} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SgkvRow} from '../../entity-schema/usecase-data/subgraph/subgraph-sgkv-data.js';
import {SubgraphOverlayFetcher} from '../../fetchers/subgraph-overlay-fetcher.js';

export class DbSubgraphQueryService implements SubgraphQueryService {
  private readonly subgraphFetcher: SubgraphOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly keyValueDefSvc: KeyValueDefQueryService,
  ) {
    this.subgraphFetcher = new SubgraphOverlayFetcher(editActionsSvc);
  }

  /**
   * Returns every subgraph for the given fileSystemId. Overlay always
   * applied — no applyOverlay flag.
   *
   * summary (default) → identity fields only, sgkvs: null
   * fullDetails       → summary + sgkvs resolved (same per-subgraph build as findMany)
   */
  async findAll(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SubgraphReadModel[]>> {
    try {
      // Step 1 — baseline load, all subgraphs scoped to this file.
      // fullDetails joins sgkv + sgkv.values (valueDefIds needed for
      // key-value pairs); summary selects identity fields only.
      let qb = this.dataSource
        .getRepository(ENTITY_NAMES.Subgraph)
        .createQueryBuilder('s')
        .where('s.fileSystemId = :fileSystemId', {fileSystemId});

      qb =
        includes === CONFIGURATION_INCLUDES.FullDetails
          ? qb
              .leftJoinAndSelect('s.sgkvs', 'sgkv')
              .leftJoinAndSelect('sgkv.values', 'sgkvVal')
          : qb.select(['s.systemId', 's.subgraphId', 's.name', 's.isExported']);

      const baselineRows = (await qb.getMany()) as SubgraphRow[];

      // Step 2 — Overlay: table-wide query, not one call per subgraph — this
      // loads ALL subgraphs so there's no fixed id list to scope by.
      // Preserve sgkvs before overlay — fetcher returns SubgraphBase[] (scalar
      // only); re-merge the relation data from the original rows after.
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      let rows: SubgraphRow[];
      if (session) {
        const sgkvsBySystemId = new Map(
          baselineRows.map(r => [r.systemId, r.sgkvs]),
        );
        const overlaidBases = await this.subgraphFetcher.applyToSubgraphs(
          baselineRows,
          fileSystemId,
          session.sessionId,
        );
        rows = overlaidBases.map(base => ({
          ...base,
          sgkvs: sgkvsBySystemId.get(base.systemId),
        })) as SubgraphRow[];
      } else {
        rows = baselineRows;
      }

      // Step 3 — summary: sgkvs deferred; fullDetails: resolve per subgraph
      if (includes !== CONFIGURATION_INCLUDES.FullDetails) {
        return Result.ok(
          rows.map(
            r =>
              ({
                systemId: r.systemId,
                subgraphId: r.subgraphId,
                name: r.name,
                isExported: Boolean(r.isExported),
                sgkvs: null,
              }) satisfies SubgraphReadModel,
          ),
        );
      }

      return this.buildManySubgraphReadModels(rows, session, fileSystemId);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to query subgraphs',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns SubgraphReadModel[] for the given systemIds, with SGKVs resolved
   * (full detail). Overlay always applied — no applyOverlay flag. Unknown
   * systemIds are silently omitted — partial result.
   */
  async findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel[]>> {
    try {
      if (systemIds.length === 0) return Result.ok([]);

      const uniqueIds = [...new Set(systemIds)];

      // Step 1 — baseline load: subgraph + sgkv + sgkv_values (valueDefIds needed for key-value pairs)
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.Subgraph)
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.sgkvs', 'sgkv')
        .leftJoinAndSelect('sgkv.values', 'sgkvVal')
        .where('s.systemId IN (:...ids)', {ids: uniqueIds})
        .andWhere('s.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as SubgraphRow[];

      // Step 2 — Overlay at table level, scoped to the requested subgraphs only.
      // Preserve sgkvs before overlay — fetcher returns SubgraphBase[]; re-merge
      // the relation data from the original rows after.
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      let overlaidRows: SubgraphRow[];
      if (session) {
        const sgkvsBySystemId = new Map(
          baselineRows.map(r => [r.systemId, r.sgkvs]),
        );
        const overlaidBases = await this.subgraphFetcher.applyToSubgraphs(
          baselineRows,
          fileSystemId,
          session.sessionId,
        );
        overlaidRows = overlaidBases.map(base => ({
          ...base,
          sgkvs: sgkvsBySystemId.get(base.systemId),
        })) as SubgraphRow[];
      } else {
        overlaidRows = baselineRows;
      }

      return this.buildManySubgraphReadModels(
        overlaidRows,
        session,
        fileSystemId,
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to query subgraphs',
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Assembly methods ─────────────────────────────────────────────────────

  /**
   * Builds SubgraphReadModel[] for a batch of subgraph rows — shared by
   * findAll(fullDetails) and findMany. Each subgraph builds independently —
   * a thrown exception, or a Result.fail from buildSubgraphReadModel, is
   * captured as an error for that subgraph and processing continues for the
   * rest. If any subgraph failed, the Result is partial (isSuccess=true,
   * errors non-empty) rather than dropping the whole array.
   */
  private async buildManySubgraphReadModels(
    rows: SubgraphRow[],
    session: ProjectSessionRow | null,
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel[]>> {
    const itemErrors: Issue[] = [];
    const results = await Promise.all(
      rows.map(async row => {
        try {
          const result = await this.buildSubgraphReadModel(
            row,
            session,
            fileSystemId,
          );
          if (result.kind === RESULT_KIND.Fail) {
            itemErrors.push(...result.issues);
            return null;
          }
          itemErrors.push(...(result.issues ?? []));
          return result.data;
        } catch (error) {
          itemErrors.push({
            code: ERROR_CODES.INTERNAL_ERROR,
            message: `Subgraph ${row.systemId} failed to build: ${error instanceof Error ? error.message : String(error)}`,
            severity: IssueSeverity.Error,
          });
          return null;
        }
      }),
    );

    const data = results.filter((r): r is SubgraphReadModel => r !== null);
    return itemErrors.length > 0
      ? Result.partial(data, itemErrors)
      : Result.ok(data);
  }

  /**
   * Builds SubgraphReadModel — overlays SGKV bin rows at the subgraph
   * aggregate level (catches a staged CREATE/UPDATE/DELETE of a whole SGKV
   * bin — the key/value pairs inside each surviving bin are separately
   * overlaid by resolveKeyValuePairs via KeyValueDefQueryService), then
   * delegates key-value pair resolution to
   * KeyValueDefQueryService.getKeyValueSummaryForGivenValues in one batched
   * call per subgraph, instead of one call per valueDefId (N+1).
   */
  private async buildSubgraphReadModel(
    row: SubgraphRow,
    session: ProjectSessionRow | null,
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel>> {
    const baseSgkvRows = row.sgkvs ?? [];
    const overlaidSgkvRows = session
      ? await this.overlaySgkvRows(baseSgkvRows, row.systemId, session)
      : baseSgkvRows;

    const itemErrors: Issue[] = [];
    const sgkvs: KeyValuePairListReadModel[] = [];
    for (const sgkvRow of overlaidSgkvRows) {
      const result = await this.buildSgkvReadModel(sgkvRow, fileSystemId);
      if (result.kind === RESULT_KIND.Fail) {
        itemErrors.push(...result.issues);
        continue;
      }
      itemErrors.push(...(result.issues ?? []));
      sgkvs.push(result.data);
    }

    const model: SubgraphReadModel = {
      systemId: row.systemId,
      subgraphId: row.subgraphId,
      name: row.name,
      isExported: Boolean(row.isExported),
      sgkvs,
    };

    return itemErrors.length > 0
      ? Result.partial(model, itemErrors)
      : Result.ok(model);
  }

  /**
   * Overlays SGKV bin rows at the subgraph aggregate level.
   * Delegates to SubgraphOverlayFetcher (handles UPDATE, DELETE, CREATE).
   * Fetcher returns SgkvBase[] — re-merge the values relation from the
   * original rows so buildSgkvReadModel can still resolve key-value pairs.
   */
  private async overlaySgkvRows(
    rows: SgkvRow[],
    subgraphSystemId: number,
    session: ProjectSessionRow,
  ): Promise<SgkvRow[]> {
    const valuesBySystemId = new Map(rows.map(r => [r.systemId, r.values]));
    const overlaidBases = await this.subgraphFetcher.applyToSgkvRows(
      rows,
      subgraphSystemId,
      session.sessionId,
    );
    return overlaidBases.map(base => ({
      ...base,
      values: valuesBySystemId.get(base.systemId),
    })) as SgkvRow[];
  }

  /**
   * Builds a key-value bin read model for one SGKV — same batched key-value
   * resolution pattern as buildCkvReadModel/buildTkvReadModel in
   * DbSpfTuningConfigService.
   */
  private async buildSgkvReadModel(
    row: SgkvRow,
    fileSystemId: number,
  ): Promise<Result<KeyValuePairListReadModel>> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const pairsResult = await this.resolveKeyValuePairs(
      valueDefIds,
      fileSystemId,
    );
    if (pairsResult.kind === RESULT_KIND.Fail)
      return Result.fail<KeyValuePairListReadModel>(...pairsResult.issues);

    const model: KeyValuePairListReadModel = {
      systemId: row.systemId,
      keyValuePairs: pairsResult.data,
    };
    const issues = pairsResult.issues ?? [];
    return issues.length > 0 ? Result.partial(model, issues) : Result.ok(model);
  }

  private async resolveKeyValuePairs(
    valueDefIds: number[],
    fileSystemId: number,
  ): Promise<Result<KeyValuePairReadModel[]>> {
    return this.keyValueDefSvc.getKeyValueSummaryForGivenValues(
      valueDefIds,
      fileSystemId,
    );
  }
}
