/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  UsecaseRepository,
  ActiveManualUsecaseEdit,
  ReadOptions,
  ReferencedComponents,
  StructuralDelta,
  UsecaseChangeRef,
  UnitOfWork,
  EditOptions,
  UsecaseType,
  IdGenerationPort,
} from '@arc/core';
import {CHANGE_OPERATION, UseCase, READ_MODE} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {OverlaidUseCase} from '../../fetchers/usecase-overlay-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../../fetchers/usecase-gkv-values-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {UseCaseSubgraphBase} from '../../entity-schema/usecase-data/use-case-subgraph.schema.js';
import type {UseCaseSubgraphPairBase} from '../../entity-schema/usecase-data/use-case-subgraph-pair.schema.js';

export class TypeOrmUsecaseRepository implements UsecaseRepository {
  private readonly ucFetcher: UsecaseOverlayFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {
    const editActionsQueryService = new EditActionsQueryService(manager);
    this.ucFetcher = new UsecaseOverlayFetcher(
      manager,
      editActionsQueryService,
      undefined,
      new UsecaseGkvValuesFetcher(manager, editActionsQueryService),
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async findBySystemIds(
    fileSystemId: number,
    ucSystemIds: readonly number[],
    options?: ReadOptions,
  ): Promise<UseCase[]> {
    if (ucSystemIds.length === 0) return [];
    const mode = options?.readMode ?? READ_MODE.Overlay;
    const sessionId =
      mode === READ_MODE.Committed
        ? null
        : this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.ucFetcher.getUsecases(fileSystemId, sessionId, [
      ...ucSystemIds,
    ]);
    return overlaid.map(uc => this.hydrateOverlaid(uc));
  }

  async findAll(
    fileSystemId: number,
    options?: ReadOptions,
  ): Promise<UseCase[]> {
    const mode = options?.readMode ?? READ_MODE.Overlay;
    const sessionId =
      mode === READ_MODE.Committed
        ? null
        : this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.ucFetcher.getUsecases(fileSystemId, sessionId);
    return overlaid.map(uc => this.hydrateOverlaid(uc));
  }

  async findWithActiveManualEdits(
    fileSystemId: number,
  ): Promise<ActiveManualUsecaseEdit[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const actions =
      await this.ucFetcher.getActiveManualUsecaseActions(sessionId);
    if (actions.length === 0) return [];

    const usecases = await this.ucFetcher.getUsecases(fileSystemId, sessionId, [
      ...new Set(actions.map(action => action.targetSystemId)),
    ]);
    const usecaseById = new Map(
      usecases.map(usecase => [
        usecase.systemId,
        this.hydrateOverlaid(usecase),
      ]),
    );

    return actions.map(action => ({
      changeId: action.changeId,
      usecase: usecaseById.get(action.targetSystemId) ?? null,
      operation:
        action.operation === CHANGE_OPERATION.Create
          ? CHANGE_OPERATION.Create
          : CHANGE_OPERATION.Update,
      referencedComponents: this.parseReferencedComponents(
        action.newValue as Record<string, unknown>,
      ),
    }));
  }

  async removeSubgraphReferences(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<{affectedUseCaseSystemIds: number[]}> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const [memberships, pairs] = await Promise.all([
      this.ucFetcher.getSubgraphMembershipRowsForSubgraph(
        fileSystemId,
        subgraphSystemId,
        sessionId,
      ),
      this.ucFetcher.getSubgraphPairRowsForSubgraph(
        fileSystemId,
        subgraphSystemId,
        sessionId,
      ),
    ]);

    const affectedUseCaseSystemIds = [
      ...new Set([
        ...memberships.map(row => row.usecaseSystemId),
        ...pairs.map(row => row.usecaseSystemId),
      ]),
    ].sort((a, b) => a - b);
    if (memberships.length === 0 && pairs.length === 0) {
      return {affectedUseCaseSystemIds};
    }

    const {session, groupId} = this.uow.getWriteContext();
    for (const row of memberships) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraph,
          targetSystemId: row.systemId,
          aggregateId: row.usecaseSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
    for (const row of pairs) {
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
          targetSystemId: row.systemId,
          aggregateId: row.usecaseSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    return {affectedUseCaseSystemIds};
  }

  // ── Writes ───────────────────────────────────────────────────────────────────

  async create(
    uc: UseCase,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<UsecaseChangeRef | null> {
    const {session, groupId} = this.uow.getWriteContext();

    const rootChangeId = await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.UseCase,
        targetSystemId: uc.systemId,
        aggregateId: uc.systemId,
        payload: {
          ['aliasId']: uc.aliasId ?? 0,
          alias: uc.alias ?? '',
          type: uc.type ?? null,
          fileSystemId: uc.fileSystemId,
          ...(referencedComponents ? {referencedComponents} : {}),
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    for (const valueDefSystemId of uc.keyVector.valueSystemIds) {
      const relationshipSystemId = await this.idGeneration.getNextId(
        uc.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.UsecaseGkvValues,
          targetSystemId: relationshipSystemId,
          aggregateId: uc.systemId,
          payload: {usecaseSystemId: uc.systemId, valueDefSystemId},
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    for (const sgSystemId of uc.subgraphSystemIds) {
      const relationshipSystemId = await this.idGeneration.getNextId(
        uc.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraph,
          targetSystemId: relationshipSystemId,
          aggregateId: uc.systemId,
          payload: {usecaseSystemId: uc.systemId, subgraphSystemId: sgSystemId},
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    for (const pair of uc.subgraphPairs) {
      const relationshipSystemId = await this.idGeneration.getNextId(
        uc.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
          targetSystemId: relationshipSystemId,
          aggregateId: uc.systemId,
          payload: {
            usecaseSystemId: uc.systemId,
            sourceSubgraphSystemId: pair.sourceSubgraphSystemId,
            destSubgraphSystemId: pair.destSubgraphSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }

    return this.toChangeRef(uc.systemId, rootChangeId);
  }

  async delete(
    ucSystemId: number,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null> {
    const {session, groupId} = this.uow.getWriteContext();
    const changeId = await this.writer.writeDelete(
      {
        targetTable: ENTITY_NAMES.UseCase,
        targetSystemId: ucSystemId,
        aggregateId: ucSystemId,
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    return this.toChangeRef(ucSystemId, changeId);
  }

  async applyStructuralChange(
    ucSystemId: number,
    delta: StructuralDelta,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<UsecaseChangeRef | null> {
    const {session, groupId} = this.uow.getWriteContext();
    let emittedStructuralChange = false;

    // Cancel any pending UseCase DELETE for this UC.
    if (delta.cancelPendingDelete) {
      emittedStructuralChange = await this.cancelPendingDelete(
        session.sessionId,
        ucSystemId,
      );
    }

    for (const pair of delta.removedPairs ?? []) {
      const relationship = await this.findSubgraphPair(
        ucSystemId,
        pair.sourceSubgraphSystemId,
        pair.destSubgraphSystemId,
      );
      if (!relationship) continue;
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
          targetSystemId: relationship.systemId,
          aggregateId: ucSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
      emittedStructuralChange = true;
    }

    for (const sgId of delta.removedSgSystemIds ?? []) {
      const relationship = await this.findSubgraphMembership(ucSystemId, sgId);
      if (!relationship) continue;
      await this.writer.writeDelete(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraph,
          targetSystemId: relationship.systemId,
          aggregateId: ucSystemId,
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
      emittedStructuralChange = true;
    }

    for (const sgId of delta.addedSgSystemIds ?? []) {
      if (await this.findSubgraphMembership(ucSystemId, sgId)) continue;
      const relationshipSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraph,
          targetSystemId: relationshipSystemId,
          aggregateId: ucSystemId,
          payload: {usecaseSystemId: ucSystemId, subgraphSystemId: sgId},
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
      emittedStructuralChange = true;
    }

    for (const pair of delta.addedPairs ?? []) {
      if (
        await this.findSubgraphPair(
          ucSystemId,
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        )
      )
        continue;
      const relationshipSystemId = await this.idGeneration.getNextId(
        session.fileSystemId,
      );
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
          targetSystemId: relationshipSystemId,
          aggregateId: ucSystemId,
          payload: {
            usecaseSystemId: ucSystemId,
            sourceSubgraphSystemId: pair.sourceSubgraphSystemId,
            destSubgraphSystemId: pair.destSubgraphSystemId,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
      emittedStructuralChange = true;
    }

    const rootChangeId = await this.writeUsecaseDelta(
      ucSystemId,
      delta.newType,
      referencedComponents,
      options,
      session.sessionId,
      groupId,
      emittedStructuralChange,
    );
    return this.toChangeRef(ucSystemId, rootChangeId);
  }

  async changeType(
    ucSystemId: number,
    newType: UsecaseType,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null> {
    const {session, groupId} = this.uow.getWriteContext();
    const changeId = await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.UseCase,
        targetSystemId: ucSystemId,
        aggregateId: ucSystemId,
        delta: {type: newType},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    return this.toChangeRef(ucSystemId, changeId);
  }

  async reverseSgPairDirection(
    ucSystemId: number,
    currentSourceSgSystemId: number,
    currentDestSgSystemId: number,
    options?: EditOptions,
  ): Promise<UsecaseChangeRef | null> {
    const {session, groupId} = this.uow.getWriteContext();
    const relationship = await this.findSubgraphPair(
      ucSystemId,
      currentSourceSgSystemId,
      currentDestSgSystemId,
    );
    if (!relationship) {
      throw new Error(
        `Subgraph pair (${currentSourceSgSystemId}, ${currentDestSgSystemId}) ` +
          `not found on UseCase ${ucSystemId}.`,
      );
    }
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.UseCaseSubgraphPair,
        targetSystemId: relationship.systemId,
        aggregateId: ucSystemId,
        fieldGroup: 'direction',
        delta: {
          sourceSubgraphSystemId: currentDestSgSystemId,
          destSubgraphSystemId: currentSourceSgSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
    const rootChangeId = await this.writeUsecaseDelta(
      ucSystemId,
      undefined,
      undefined,
      options,
      session.sessionId,
      groupId,
      true,
    );
    return this.toChangeRef(ucSystemId, rootChangeId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async writeUsecaseDelta(
    ucSystemId: number,
    newType: UsecaseType | undefined,
    referencedComponents: ReferencedComponents | undefined,
    options: EditOptions | undefined,
    sessionId: number,
    groupId: string,
    writeMarker = false,
  ): Promise<number | null> {
    const usecaseDelta: Record<string, unknown> = {};
    if (newType !== undefined) usecaseDelta.type = newType;
    if (referencedComponents !== undefined) {
      usecaseDelta.referencedComponents = referencedComponents;
    }
    if (
      Object.keys(usecaseDelta).length === 0 &&
      (!writeMarker || options?.cache === true)
    ) {
      return null;
    }

    return this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.UseCase,
        targetSystemId: ucSystemId,
        aggregateId: ucSystemId,
        delta: usecaseDelta,
        ...options,
      },
      sessionId,
      groupId,
      this.manager,
    );
  }

  private toChangeRef(
    systemId: number,
    changeId: number | null,
  ): UsecaseChangeRef | null {
    return changeId === null ? null : {systemId, changeId};
  }

  private async cancelPendingDelete(
    sessionId: number,
    ucSystemId: number,
  ): Promise<boolean> {
    // eslint-disable-next-line custom/no-raw-persistence-queries -- checking active DELETE rows by operation is not expressible through the UseCase entity repository
    const pendingDeletes: unknown = await this.manager.query(
      `SELECT change_id
         FROM edit_actions
        WHERE session_id = $1
          AND target_system_id = $2
          AND target_table = $3
          AND operation = 'DELETE'
          AND valid_until IS NULL
        LIMIT 1`,
      [sessionId, ucSystemId, ENTITY_NAMES.UseCase],
    );
    if (!Array.isArray(pendingDeletes) || pendingDeletes.length === 0) {
      return false;
    }

    // eslint-disable-next-line custom/no-raw-persistence-queries -- superseding by operation type is not expressible with TypeORM QueryBuilder
    await this.manager.query(
      `UPDATE edit_actions
          SET valid_until = $1
        WHERE session_id = $2
          AND target_system_id = $3
          AND target_table = $4
          AND operation = 'DELETE'
          AND valid_until IS NULL`,
      [new Date().toISOString(), sessionId, ucSystemId, ENTITY_NAMES.UseCase],
    );
    return true;
  }

  private async findSubgraphMembership(
    usecaseSystemId: number,
    subgraphSystemId: number,
  ): Promise<UseCaseSubgraphBase | undefined> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.ucFetcher.getSubgraphMembershipRows(
      [usecaseSystemId],
      sessionId,
    );
    return rows.find(row => row.subgraphSystemId === subgraphSystemId);
  }

  private async findSubgraphPair(
    usecaseSystemId: number,
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): Promise<UseCaseSubgraphPairBase | undefined> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.ucFetcher.getSubgraphPairRows(
      [usecaseSystemId],
      sessionId,
    );
    return rows.find(
      row =>
        row.sourceSubgraphSystemId === sourceSubgraphSystemId &&
        row.destSubgraphSystemId === destSubgraphSystemId,
    );
  }

  private hydrateOverlaid(uc: OverlaidUseCase): UseCase {
    return new UseCase({
      systemId: uc.systemId,
      fileSystemId: uc.fileSystemId,
      alias: uc.alias,
      aliasId: uc.aliasId,
      type: uc.type ?? undefined,
      categories: uc.categoryNames,
      subgraphSystemIds: uc.subgraphSystemIds,
      subgraphPairs: uc.subgraphPairs,
      keyVector: {
        valueSystemIds: uc.gkvEntries.map(g => g.valueDefSystemId),
      },
    });
  }

  private parseReferencedComponents(
    value: Record<string, unknown>,
  ): ActiveManualUsecaseEdit['referencedComponents'] {
    const referencedComponents = value.referencedComponents;
    if (
      referencedComponents === null ||
      typeof referencedComponents !== 'object' ||
      Array.isArray(referencedComponents)
    ) {
      return null;
    }

    const payload = referencedComponents as Record<string, unknown>;
    const isNumberArray = (candidate: unknown): candidate is number[] =>
      Array.isArray(candidate) &&
      candidate.every(
        item => typeof item === 'number' && Number.isSafeInteger(item),
      );

    if (
      !isNumberArray(payload.sgSystemIds) ||
      !isNumberArray(payload.dataLinkSystemIds) ||
      !isNumberArray(payload.controlLinkSystemIds)
    ) {
      return null;
    }

    return {
      sgSystemIds: [...payload.sgSystemIds],
      dataLinkSystemIds: [...payload.dataLinkSystemIds],
      controlLinkSystemIds: [...payload.controlLinkSystemIds],
    };
  }
}
