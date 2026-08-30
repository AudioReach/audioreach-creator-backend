/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {
  TkvParameterPayloadBase,
  TkvParameterPayloadRow,
} from '../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';

/**
 * Fetches tkv_parameter_payload rows for a given Tkv with session overlay applied.
 *
 * Separated from TkvOverlayFetcher per §6 Rule A: TkvParameterPayload has a direct FK
 * to Tkv and therefore owns its own overlay fetcher injected into the parent.
 *
 * Uses getByTable (one session-wide scan) to avoid per-payload N+1 queries.
 * spfParameter (parameter definition) data is returned from the base JOIN and is
 * NOT overlaid here — parameter definition edit_actions use a different aggregateId.
 */
export class TkvParameterPayloadFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid TkvParameterPayload rows for the given tkvSystemId.
   */
  async fetchMany(
    tkvSystemId: number,
    sessionId: number | null,
  ): Promise<TkvParameterPayloadBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.TkvParameterPayload)
      .createQueryBuilder('p')
      .where('p.tkvSystemId = :tkvSystemId', {tkvSystemId})
      .getMany()) as TkvParameterPayloadRow[];

    if (sessionId === null) return baseRows;

    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.TkvParameterPayload,
    );
    const relevantActions = allActions.filter(
      a =>
        (a.newValue as {tkvSystemId?: number})?.tkvSystemId === tkvSystemId ||
        baseRows.some(r => r.systemId === a.targetSystemId),
    );
    if (relevantActions.length === 0) return baseRows;

    return (
      this.overlay.applyToCollection(
        baseRows.map(r => ({...r})),
        relevantActions,
      ) as Array<{effective: TkvParameterPayloadBase}>
    ).map(r => r.effective);
  }
}
