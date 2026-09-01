/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  KeyValueDefQueryService,
  VcpmCalibrationQueryService,
  VcpmCkvReadModel,
  VcpmParameterPayloadReadModel,
} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {VcpmCkvOverlayFetcher} from '../../fetchers/vcpm-ckv-overlay-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';

export class DbVcpmCalibrationQueryService
  implements VcpmCalibrationQueryService
{
  private readonly ckvFetcher: VcpmCkvOverlayFetcher;
  private readonly payloadFetcher: VcpmParameterPayloadFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
  ) {
    this.ckvFetcher = new VcpmCkvOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    this.payloadFetcher = new VcpmParameterPayloadFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
  }

  async getCkv(
    fileSystemId: number,
    subgraphSystemId: number,
    ckvSystemId: number,
  ): Promise<VcpmCkvReadModel | null> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const row = await this.ckvFetcher.fetchOne(
      ckvSystemId,
      subgraphSystemId,
      sessionId,
    );
    if (row === null) return null;

    const valueSystemIds = row.values.map(value => value.valueDefSystemId);
    const pairsResult =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueSystemIds,
        fileSystemId,
      );
    if (pairsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        `Failed to resolve VCPM CKV values: ${pairsResult.issues
          .map(issue => issue.message)
          .join(', ')}`,
      );
    }

    return {
      systemId: row.systemId,
      keyValuePairs: pairsResult.data,
    };
  }

  async getPayloads(
    fileSystemId: number,
    subgraphSystemId: number,
    ckvSystemId: number,
    payloadSystemIds?: number[],
  ): Promise<VcpmParameterPayloadReadModel[]> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const payloads = await this.payloadFetcher.fetchMany(
      ckvSystemId,
      subgraphSystemId,
      sessionId,
      payloadSystemIds && payloadSystemIds.length > 0
        ? {systemId: payloadSystemIds}
        : undefined,
    );

    return payloads.map(payload => ({
      systemId: payload.systemId,
      vcpmParameterSystemId: payload.vcpmParameterSystemId,
      payload: payload.payload,
    }));
  }
}
