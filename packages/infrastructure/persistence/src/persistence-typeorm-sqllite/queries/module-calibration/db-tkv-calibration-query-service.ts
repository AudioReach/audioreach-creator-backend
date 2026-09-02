/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import type {
  TkvQueryService,
  TkvReadModel,
  ParameterPayloadReadModel,
  KeyValueDefQueryService,
} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  TkvOverlayFetcher,
  type OverlaidTkv,
} from '../../fetchers/tkv-overlay-fetcher.js';
import {TkvParameterPayloadFetcher} from '../../fetchers/tkv-parameter-payload-fetcher.js';
import type {TkvParameterPayloadBase} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';

/**
 * Database implementation of TkvQueryService.
 *
 * Single-TKV fetch delegated to TkvOverlayFetcher.fetchTkv.
 * Payload fetch delegated to TkvOverlayFetcher.fetchTkvPayloads.
 * Key-value pair resolution (transformToTkvReadModel) delegated to
 * KeyValueDefQueryService — same cross-aggregate enrichment as CKV.
 *
 * Aggregate IDs in edit_actions:
 *   tkv                   → aggregateId = moduleTagIdMapSystemId
 *   tkv_parameter_payload → matched by tkvSystemId in newValue
 */
export class DbTkvCalibrationQueryService implements TkvQueryService {
  private readonly tkvFetcher: TkvOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
  ) {
    this.tkvFetcher = new TkvOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      new TkvParameterPayloadFetcher(
        dataSource.manager,
        editActionsQueryService,
      ),
    );
  }

  async getTkv(
    fileSystemId: number,
    _moduleSystemId: number,
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<TkvReadModel | null> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const overlaid = await this.tkvFetcher.fetchTkv(
      tkvSystemId,
      moduleTagIdMapSystemId,
      sessionId,
    );
    return overlaid
      ? this.transformToTkvReadModel(overlaid, fileSystemId)
      : null;
  }

  async getTkvPayloads(
    fileSystemId: number,
    _moduleSystemId: number,
    tkvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const all = await this.tkvFetcher.fetchPayloads(tkvSystemId, sessionId);
    const filtered =
      paramSystemIds && paramSystemIds.length > 0
        ? all.filter(p => paramSystemIds.includes(p.systemId))
        : all;
    return filtered.map(p => this.toParameterPayloadReadModel(p));
  }

  private async transformToTkvReadModel(
    row: OverlaidTkv,
    fileSystemId: number,
  ): Promise<TkvReadModel> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairsResult =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );
    if (pairsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        `Failed to resolve TKV key-value pairs: ${pairsResult.issues.map(e => e.message).join(', ')}`,
      );
    }
    return {
      systemId: row.systemId,
      moduleTagIdMapSystemId: row.moduleTagIdMapSystemId,
      keyValuePairs: pairsResult.data,
    };
  }

  private toParameterPayloadReadModel(
    row: TkvParameterPayloadBase,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
