/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  CkvQueryService,
  CkvReadModel,
  ParameterPayloadReadModel,
  KeyValueDefQueryService,
} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  CkvOverlayFetcher,
  type OverlaidCkv,
} from '../../fetchers/ckv-overlay-fetcher.js';
import {CkvParameterPayloadFetcher} from '../../fetchers/ckv-parameter-payload-fetcher.js';
import type {CkvParameterPayloadBase} from '../../fetchers/ckv-parameter-payload-fetcher.js';

/**
 * Database implementation of CkvQueryService.
 *
 * All overlay delegated to CkvOverlayFetcher (FR-3):
 *   fetchOne    — Ckv root with session overlay; ckv_values returned as-is
 *                 (composite PK, not overlaid)
 *   fetchPayloads — CkvParameterPayload rows with session overlay
 *
 * Key-value pair resolution (transformToCkvReadModel) is cross-aggregate
 * enrichment delegated to KeyValueDefQueryService (FR-4).
 *
 * Note: aggregateId for Ckv edit_actions is moduleSystemId (the owning
 * SpfModule's PK), not the ckvSystemId.
 */
export class DbCkvCalibrationQueryService implements CkvQueryService {
  private readonly ckvFetcher: CkvOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
  ) {
    this.ckvFetcher = new CkvOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      new CkvParameterPayloadFetcher(
        dataSource.manager,
        editActionsQueryService,
      ),
    );
  }

  /**
   * Retrieves a single CKV row with its key-value pairs,
   * applying any active session overlay.
   */
  async getCkv(
    fileSystemId: number,
    _moduleSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const overlaid = await this.ckvFetcher.fetchOne(ckvSystemId, sessionId);
    return overlaid
      ? this.transformToCkvReadModel(overlaid, fileSystemId)
      : null;
  }

  /**
   * Retrieves parameter payload rows for a CKV, applying any active session
   * overlay. Optionally filtered to a specific set of parameter system IDs.
   */
  async getCkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource,
      fileSystemId,
    );
    const overlaid = await this.ckvFetcher.fetchPayloads(
      ckvSystemId,
      moduleSystemId,
      sessionId,
      paramSystemIds ? {systemId: paramSystemIds} : undefined,
    );
    return overlaid.map(p => this.toParameterPayloadReadModel(p));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Maps an overlaid Ckv to CkvReadModel, resolving key-value pairs via
   * KeyValueDefQueryService (cross-aggregate enrichment — FR-4).
   */
  private async transformToCkvReadModel(
    row: OverlaidCkv,
    fileSystemId: number,
  ): Promise<CkvReadModel> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairsResult =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );

    if (pairsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        `Failed to resolve key-value pairs: ${pairsResult.issues.map(e => e.message).join(', ')}`,
      );
    }

    return {
      systemId: row.systemId,
      uiPersistence: row.uiPersistence ?? null,
      keyValuePairs: pairsResult.data,
    };
  }

  private toParameterPayloadReadModel(
    row: CkvParameterPayloadBase,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
