/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  UsecaseRepository,
  ReadOptions,
  ReferencedComponents,
  StructuralDelta,
  UnitOfWork,
  EditOptions,
  UsecaseType,
  IdGenerationPort,
} from '@arc/core';
import {UseCase, READ_MODE} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {OverlaidUseCase} from '../../fetchers/usecase-overlay-fetcher.js';
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
    this.ucFetcher = new UsecaseOverlayFetcher(
      manager,
      new EditActionsQueryService(manager),
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

  async findWithActiveManualEdits(fileSystemId: number): Promise<UseCase[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.ucFetcher.fetchWithActiveManualEdits(
      fileSystemId,
      sessionId,
    );
    return overlaid.map(uc => this.hydrateOverlaid(uc));
  }

  // ── Writes ───────────────────────────────────────────────────────────────────

  async create(
    uc: UseCase,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.UseCase,
        targetSystemId: uc.systemId,
        aggregateId: uc.systemId,
        payload: {
          aliasId: uc.aliasId ?? 0,
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
  }

  async delete(ucSystemId: number, options?: EditOptions): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelete(
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
  }

  async applyStructuralChange(
    ucSystemId: number,
    delta: StructuralDelta,
    options?: EditOptions,
    referencedComponents?: ReferencedComponents,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    // Cancel any pending UseCase DELETE for this UC (FR-EC-07 Rule D).
    if (delta.cancelPendingDelete) {
      // eslint-disable-next-line custom/no-raw-persistence-queries -- supersedeCurrent pattern; superseding by operation type is not expressible with TypeORM QueryBuilder
      await this.manager.query(
        `UPDATE edit_actions
            SET valid_until = $1
          WHERE session_id = $2
            AND target_system_id = $3
            AND target_table = $4
            AND operation = 'DELETE'
            AND valid_until IS NULL`,
        [
          new Date().toISOString(),
          session.sessionId,
          ucSystemId,
          ENTITY_NAMES.UseCase,
        ],
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
    }

    await this.writeUsecaseDelta(
      ucSystemId,
      delta.newType,
      referencedComponents,
      options,
      session.sessionId,
      groupId,
    );
  }

  async changeType(
    ucSystemId: number,
    newType: UsecaseType,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    await this.writer.writeDelta(
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
  }

  async reverseSgPairDirection(
    ucSystemId: number,
    currentSourceSgSystemId: number,
    currentDestSgSystemId: number,
    options?: EditOptions,
  ): Promise<void> {
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
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async writeUsecaseDelta(
    ucSystemId: number,
    newType: UsecaseType | undefined,
    referencedComponents: ReferencedComponents | undefined,
    options: EditOptions | undefined,
    sessionId: number,
    groupId: string,
  ): Promise<void> {
    const usecaseDelta: Record<string, unknown> = {};
    if (newType !== undefined) usecaseDelta.type = newType;
    if (referencedComponents !== undefined) {
      usecaseDelta.referencedComponents = referencedComponents;
    }
    if (Object.keys(usecaseDelta).length === 0) return;

    await this.writer.writeDelta(
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
}
