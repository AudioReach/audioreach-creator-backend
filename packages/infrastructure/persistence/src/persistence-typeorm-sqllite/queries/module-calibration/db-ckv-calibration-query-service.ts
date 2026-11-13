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
    moduleSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null> {
    const sessionId = await resolveActiveSessionId(
      this.dataSource.manager,
      fileSystemId,
    );
    const overlaid = await this.ckvFetcher.fetchOne(
      ckvSystemId,
      moduleSystemId,
      sessionId,
    );
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
      this.dataSource.manager,
      fileSystemId,
    );
    const overlaid = await this.ckvFetcher.fetchPayloads(
      ckvSystemId,
      moduleSystemId,
      sessionId,
      paramSystemIds && paramSystemIds.length > 0
        ? {parameterSystemId: paramSystemIds}
        : undefined,
    );
    return overlaid.map(p => this.toParameterPayloadReadModel(p));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Maps an overlaid Ckv to CkvReadModel, resolving key-value pairs via
   * KeyValueDefQueryService (cross-aggregate enrichment — FR-4). Throws if
   * a value definition is missing: a CKV is only usable with all its values.
   */
  private async transformToCkvReadModel(
    row: OverlaidCkv,
    fileSystemId: number,
  ): Promise<CkvReadModel> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairs = await this.keyValueDefQueryService.findKeyValuePairs(
      fileSystemId,
      valueDefIds,
    );
    const missing = pairs.failed.at(0);
    if (missing !== undefined) {
      throw new Error(
        `CKV ${row.systemId} references missing value definition ${missing.systemId}`,
      );
    }
    return {
      systemId: row.systemId,
      uiPersistence: row.uiPersistence ?? null,
      keyValuePairs: pairs.items,
    };
  }

  private toParameterPayloadReadModel(
    row: CkvParameterPayloadBase,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
