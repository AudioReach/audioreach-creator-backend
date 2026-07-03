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
  KeyDefinitionSummaryReadModel,
  ValueDefinitionSummaryReadModel,
} from '@arc/core';
import {Result, RESULT_KIND} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {
  applyToSingle,
  applyToCollection,
} from '../edit-session/overlay-merge.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
/**
 * Database implementation of `CkvQueryService`.
 *
 * Applies the three-tier session overlay pattern:
 * 1. If no active session exists → return base rows directly from the DB
 * 2. If a session exists but has no edit actions for this aggregate → return base rows
 * 3. If edit actions exist → merge them over the base rows using `applyToSingle` / `applyToCollection`
 *
 * Note: Key-value pairs are resolved via
 * `KeyValueDefQueryService.getKeyValueSummaryForGivenValues` using the
 * `valueDefSystemId` foreign key stored directly on each `CkvValues` join-table row.
 */
export class DbCkvCalibrationQueryService implements CkvQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
  ) {}

  /**
   * Retrieves a single CKV row with its key-value pairs,
   * applying any active session overlay.
   */
  async getCkv(
    fileSystemId: number,
    moduleSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null> {
    const session =
      await this.editActionsQueryService.findActiveSession(fileSystemId);
    if (!session) return this.queryCkvRow(ckvSystemId, fileSystemId);

    const editActions =
      await this.editActionsQueryService.getEditActionsByAggregateId(
        session.sessionId,
        moduleSystemId,
      );

    const baseCkv = await this.queryCkvRowRaw(ckvSystemId);
    const ckvAction =
      editActions.find(
        a => a.tableName === ENTITY_NAMES.Ckv && a.systemId === ckvSystemId,
      ) ?? null;

    const overlaidCkv = applyToSingle(baseCkv, ckvAction);
    if (!overlaidCkv) return null;

    // CkvValues uses a composite key (ckvSystemId + valueDefSystemId) so it cannot
    // be overlaid with applyToCollection. The key-value pairs are returned as-is
    // from the base row; only the CKV row itself is overlaid.
    return this.transformToCkvReadModel(overlaidCkv, fileSystemId);
  }

  /**
   * Retrieves parameter payload rows for a CKV, applying any active session overlay.
   * Optionally filtered to a specific set of parameter system IDs.
   */
  async getCkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const session =
      await this.editActionsQueryService.findActiveSession(fileSystemId);
    if (!session) return this.queryCkvPayloads(ckvSystemId, paramSystemIds);

    const editActions =
      await this.editActionsQueryService.getEditActionsByAggregateId(
        session.sessionId,
        moduleSystemId,
      );
    if (editActions.length === 0)
      return this.queryCkvPayloads(ckvSystemId, paramSystemIds);

    const payloadActions = editActions.filter(
      a => a.tableName === ENTITY_NAMES.CkvParameterPayload,
    );
    const basePayloads = await this.queryCkvPayloadsRaw(ckvSystemId);
    const overlaidPayloads = applyToCollection(basePayloads, payloadActions);

    const filtered = paramSystemIds
      ? overlaidPayloads.filter(p =>
          paramSystemIds.includes(p.parameterSystemId),
        )
      : overlaidPayloads;

    return filtered.map(p => this.transformToParameterCalibrationReadModel(p));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async queryCkvRow(
    ckvSystemId: number,
    fileSystemId: number,
  ): Promise<CkvReadModel | null> {
    const row = await this.queryCkvRowRaw(ckvSystemId);
    return row ? this.transformToCkvReadModel(row, fileSystemId) : null;
  }

  private async queryCkvRowRaw(ckvSystemId: number): Promise<CkvRow | null> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne() as Promise<CkvRow | null>;
  }

  private async queryCkvPayloads(
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const rows = await this.queryCkvPayloadsRaw(ckvSystemId, paramSystemIds);
    return rows.map(r => this.transformToParameterCalibrationReadModel(r));
  }

  private async queryCkvPayloadsRaw(
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<CkvParameterPayloadRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.ckvSystemId = :ckvSystemId', {ckvSystemId});
    if (paramSystemIds && paramSystemIds.length > 0) {
      qb.andWhere('payload.parameterSystemId IN (:...ids)', {
        ids: paramSystemIds,
      });
    }
    return qb.getMany() as Promise<CkvParameterPayloadRow[]>;
  }

  private async transformToCkvReadModel(
    row: CkvRow,
    fileSystemId: number,
  ): Promise<CkvReadModel> {
    const valueDefIds = (row.values ?? []).map(v => v.valueDefSystemId);
    const pairsResult = await this.buildKeyValuePairs(
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

  private transformToParameterCalibrationReadModel(
    row: CkvParameterPayloadRow,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }

  /**
   * Resolves valueDefIds to {key, value} summary pairs via one batched
   * `getKeyValueSummaryForGivenValues` call — same pattern as
   * `resolveKeyValuePairs` in `DbSpfTuningConfigService`.
   */
  private async buildKeyValuePairs(
    valueDefIds: number[],
    fileSystemId: number,
  ): Promise<
    Result<
      Array<{
        key: KeyDefinitionSummaryReadModel;
        value: ValueDefinitionSummaryReadModel;
      }>
    >
  > {
    return this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
      valueDefIds,
      fileSystemId,
    );
  }
}
