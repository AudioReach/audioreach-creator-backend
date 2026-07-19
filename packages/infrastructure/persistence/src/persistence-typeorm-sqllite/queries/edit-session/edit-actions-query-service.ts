/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation, ChangeStatus, Source} from '@arc/core';
import {type EntityName} from '../../entity-schema/entity-table-names.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {ProjectSessionRow} from '../../entity-schema/edit-session/project-session.schema.js';
import type {EntityManager, SelectQueryBuilder} from 'typeorm';

/**
 * All-in-one filter for edit-action queries. Every field is optional;
 * omitting a field means "no filter on that dimension".
 * `validUntil IS NULL` is always applied implicitly.
 */
export type EditActionsQueryFilters = {
  sessionId: number;
  aggregateId?: number;
  targetTable?: EntityName;
  source?: Source;
  operations?: ChangeOperation[];
  changeStatus?: ChangeStatus;
};

/**
 * Options for narrowing the result set of an edit-action query.
 * All fields are optional — omitting a field means "no filter on that dimension".
 * All queries additionally filter `valid_until IS NULL` implicitly.
 */
export type EditActionsQueryOptions = {
  /** Filter by operation type. Omit to return all operations. */
  operations?: ChangeOperation[];
  /** Filter by change status. Omit to return both STAGED + UNSTAGED. */
  changeStatus?: ChangeStatus;
  /** Filter by source. Omit to return all sources. */
  source?: Source;
};

/**
 * Pure read service for the edit_actions table (LLD1 §11).
 *
 * Accepts an EntityManager so it works both inside a transaction
 * (pass queryRunner.manager — writes are visible immediately) and
 * outside one (pass dataSource.manager — read-only overlay lookups).
 *
 * All queries filter `valid_until IS NULL` (active rows only).
 * Delete operations and session-lifecycle queries are NOT on this service.
 */
export class EditActionsQueryService {
  constructor(private readonly manager: EntityManager) {}

  /**
   * Unified query accepting all filter criteria in one call.
   * Prefer this over the individual getBy* methods when multiple
   * filter dimensions are needed — avoids multiple round-trips.
   */
  async query(filters: EditActionsQueryFilters): Promise<EditActionRow[]> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId: filters.sessionId})
      .andWhere('ea.validUntil IS NULL');

    if (filters.aggregateId !== undefined) {
      qb.andWhere('ea.aggregateId = :aggregateId', {
        aggregateId: filters.aggregateId,
      });
    }
    if (filters.targetTable !== undefined) {
      qb.andWhere('ea.targetTable = :targetTable', {
        targetTable: filters.targetTable,
      });
    }
    if (filters.source !== undefined) {
      qb.andWhere('ea.source = :source', {source: filters.source});
    }
    if (filters.operations != null && filters.operations.length > 0) {
      qb.andWhere('ea.operation IN(:...operations)', {
        operations: filters.operations,
      });
    }
    if (filters.changeStatus !== undefined) {
      qb.andWhere('ea.changeStatus = :changeStatus', {
        changeStatus: filters.changeStatus,
      });
    }

    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getByAggregateId(
    sessionId: number,
    aggregateId: number,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.aggregateId = :aggregateId', {aggregateId})
      .andWhere('ea.validUntil IS NULL');
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getByAggregateAndTable(
    sessionId: number,
    aggregateId: number,
    targetTable: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.aggregateId = :aggregateId', {aggregateId})
      .andWhere('ea.targetTable = :targetTable', {targetTable})
      .andWhere('ea.validUntil IS NULL');
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getByTable(
    sessionId: number,
    targetTable: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.targetTable = :targetTable', {targetTable})
      .andWhere('ea.validUntil IS NULL');
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getBySource(
    sessionId: number,
    source: Source,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.source = :source', {source})
      .andWhere('ea.validUntil IS NULL');
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async findCurrentRow(
    sessionId: number,
    targetSystemId: number,
    fieldPath: string | null,
  ): Promise<EditActionRow | null> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.targetSystemId = :targetSystemId', {targetSystemId})
      .andWhere('ea.validUntil IS NULL');

    if (fieldPath === null) {
      qb.andWhere('ea.fieldPath IS NULL');
    } else {
      qb.andWhere('ea.fieldPath = :fieldPath', {fieldPath});
    }

    return qb.getOne() as Promise<EditActionRow | null>;
  }

  // ── Backwards-compat shim — LLD3 removes when read services are rewritten ─

  /**
   * @deprecated Session lookup moved to ISessionRepository (LLD1 §7b.3).
   * Existing read-overlay services still call this until LLD3 rewrites them.
   */
  async findActiveSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow | null> {
    return this.manager
      .getRepository(ENTITY_NAMES.ProjectSession)
      .createQueryBuilder('session')
      .where('session.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('session.status = :status', {status: 'ACTIVE'})
      .getOne() as Promise<ProjectSessionRow | null>;
  }

  private baseQb(): SelectQueryBuilder<object> {
    return this.manager
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea');
  }

  private applyOptions(
    qb: SelectQueryBuilder<object>,
    options?: EditActionsQueryOptions,
  ): void {
    if (options?.operations != null && options.operations.length > 0) {
      qb.andWhere('ea.operation IN(:...operations)', {
        operations: options.operations,
      });
    }
    if (options?.changeStatus != null) {
      qb.andWhere('ea.changeStatus = :changeStatus', {
        changeStatus: options.changeStatus,
      });
    }
    if (options?.source != null) {
      qb.andWhere('ea.source = :source', {source: options.source});
    }
  }
}
