/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation, ChangeStatus, Source} from '@arc/core';
import {type EntityName} from '../../entity-schema/entity-table-names.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {ProjectSessionRow} from '../../entity-schema/edit-session/project-session.schema.js';
import {SESSION_STATUS} from '../../entity-schema/edit-session/project-session.schema.js';
import {
  editActionTargetKeyString,
  type EditActionTargetKey,
} from '../../services/pending-target-reducer.js';
import type {EntityManager, SelectQueryBuilder} from 'typeorm';

/**
 * All-in-one filter for edit-action queries. Every field is optional;
 * omitting a field means "no filter on that dimension".
 * All rows are current rows; no history predicate is required.
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
 * Every edit-action query returns the current pending projection.
 */
export class EditActionsQueryService {
  constructor(private readonly manager: EntityManager) {}

  /**
   * Unified query accepting all filter criteria in one call.
   * Prefer this over the individual getBy* methods when multiple
   * filter dimensions are needed — avoids multiple round-trips.
   */
  async query(filters: EditActionsQueryFilters): Promise<EditActionRow[]> {
    const qb = this.baseQb().where('ea.sessionId = :sessionId', {
      sessionId: filters.sessionId,
    });

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
    if (hasOperationsFilter(filters.operations)) {
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
      .andWhere('ea.aggregateId = :aggregateId', {aggregateId});
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
      .andWhere('ea.targetTable = :targetTable', {targetTable});
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
      .andWhere('ea.targetTable = :targetTable', {targetTable});
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
      .andWhere('ea.source = :source', {source});
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async findCurrentRow(
    sessionId: number,
    targetSystemId: number,
    targetTable: EntityName,
    fieldPath: string | null,
  ): Promise<EditActionRow | null> {
    const qb = this.baseQb()
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.targetSystemId = :targetSystemId', {targetSystemId})
      .andWhere('ea.targetTable = :targetTable', {targetTable});

    if (fieldPath === null) {
      qb.andWhere('ea.fieldPath IS NULL');
    } else {
      qb.andWhere('ea.fieldPath = :fieldPath', {fieldPath});
    }

    return qb.getOne() as Promise<EditActionRow | null>;
  }

  async getAllByTargetKey(
    target: EditActionTargetKey,
    manager: EntityManager = this.manager,
  ): Promise<EditActionRow[]> {
    return manager
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.sessionId = :sessionId', {sessionId: target.sessionId})
      .andWhere('ea.targetTable = :targetTable', {
        targetTable: target.targetTable,
      })
      .andWhere('ea.targetSystemId = :targetSystemId', {
        targetSystemId: target.targetSystemId,
      })
      .orderBy('ea.changeId', 'ASC')
      .getMany() as Promise<EditActionRow[]>;
  }

  async getAllByTargetKeys(
    targets: readonly EditActionTargetKey[],
    manager: EntityManager = this.manager,
  ): Promise<Map<string, EditActionRow[]>> {
    const result = new Map<string, EditActionRow[]>();
    for (const target of targets) {
      result.set(editActionTargetKeyString(target), []);
    }

    const bySessionAndTable = new Map<string, EditActionTargetKey[]>();
    for (const target of targets) {
      const key = `${target.sessionId}|${target.targetTable}`;
      const group = bySessionAndTable.get(key) ?? [];
      group.push(target);
      bySessionAndTable.set(key, group);
    }

    await Promise.all(
      [...bySessionAndTable.values()].map(async group => {
        const first = group[0];
        const rows = (await manager
          .getRepository(ENTITY_NAMES.EditAction)
          .createQueryBuilder('ea')
          .where('ea.sessionId = :sessionId', {sessionId: first.sessionId})
          .andWhere('ea.targetTable = :targetTable', {
            targetTable: first.targetTable,
          })
          .andWhere('ea.targetSystemId IN (:...targetSystemIds)', {
            targetSystemIds: [
              ...new Set(group.map(target => target.targetSystemId)),
            ],
          })
          .orderBy('ea.changeId', 'ASC')
          .getMany()) as EditActionRow[];

        for (const row of rows) {
          result
            .get(
              editActionTargetKeyString({
                sessionId: row.sessionId,
                targetTable: row.targetTable,
                targetSystemId: row.targetSystemId,
              }),
            )
            ?.push(row);
        }
      }),
    );

    return result;
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
      .andWhere('session.status = :status', {status: SESSION_STATUS.Active})
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
    if (hasOperationsFilter(options?.operations)) {
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

function hasOperationsFilter(
  operations: readonly ChangeOperation[] | null | undefined,
): operations is readonly ChangeOperation[] {
  return Array.isArray(operations) && operations.length > 0;
}
