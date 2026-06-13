/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeOperation, ChangeStatus} from '@arc/core';
import {
  ENTITY_NAMES,
  type EntityName,
} from '../../entity-schema/entity-table-names.js';
import {
  SESSION_STATUS,
  type EditActionRow,
  type ProjectSessionRow,
} from '../../entity-schema/index.js';
import type {DataSource, SelectQueryBuilder} from 'typeorm';

export interface EditActionsQueryOptions {
  /**
   * Filter by operation type.
   * null | undefined → return all operations (ADD + UPDATE + DELETE)
   */
  operations?: ChangeOperation[] | null;

  /**
   * Filter by change status.
   * null | undefined → return all changeStatuses STAGED + UNSTAGED
   */
  changeStatus?: ChangeStatus | null;
}

export class EditActionsQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async findActiveSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow | null> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.ProjectSession)
      .createQueryBuilder('session')
      .where('session.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('session.status = :status', {status: SESSION_STATUS.Active})
      .getOne() as Promise<ProjectSessionRow | null>;
  }

  async getAllEditActions(
    sessionId: number,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.validUntil IS NULL');

    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getEditActionsByAggregateId(
    sessionId: number,
    aggregateId: number,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.aggregateId = :aggregateId', {aggregateId})
      .andWhere('ea.validUntil IS NULL');
    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getEditActionByAggregateAndTable(
    sessionId: number,
    aggregateId: number,
    tableName: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.aggregateId = :aggregateId', {aggregateId})
      .andWhere('ea.tableName = :tableName', {tableName})
      .andWhere('ea.validUntil IS NULL');

    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  async getEditActionsByTable(
    sessionId: number,
    tableName: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.EditAction)
      .createQueryBuilder('ea')
      .where('ea.sessionId = :sessionId', {sessionId})
      .andWhere('ea.tableName = :tableName', {tableName})
      .andWhere('ea.validUntil IS NULL');

    this.applyOptions(qb, options);
    return qb.getMany() as Promise<EditActionRow[]>;
  }

  /**
   * Appends operation and changeStatus WHERE clauses to the query builder.
   *
   * changeStatus default (null | undefined): STAGED + UNSTAGED.
   * Pass an explicit value to restrict to a single status.
   */
  private applyOptions(
    qb: SelectQueryBuilder<object>,
    options?: EditActionsQueryOptions,
  ): void {
    if (options?.operations != null) {
      qb.andWhere('ea.operation IN(:...operations', {
        operations: options.operations,
      });
    }

    if (options?.changeStatus != null) {
      qb.andWhere('ea.changeStatus = :changeStatus', {
        changeStatus: options.changeStatus,
      });
    }
  }
}
