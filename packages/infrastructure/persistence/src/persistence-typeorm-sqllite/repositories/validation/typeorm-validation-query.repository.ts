/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ValidationQueryRepository,
  ValidationPreferences,
  ValidationIssue,
  SpfModule,
  UseCase,
  Subgraph,
  DataLink,
  ControlLink,
  SpfModuleDefinition,
} from '@arc/core';
import {EMPTY_PREFERENCES} from '@arc/core';
import {TypeOrmValidationPreferencesRepository} from './typeorm-validation-preferences.repository.js';
import {ArcDbFileSchema} from '../../entity-schema/project-data/arc-db-file.schema.js';
import type {ArcDbFileRow} from '../../entity-schema/project-data/arc-db-file.schema.js';

/**
 * TypeORM implementation of ValidationQueryRepository.
 * Entity-loading methods are stubs — implemented when the validate endpoint is wired.
 * getPreferences delegates to TypeOrmValidationPreferencesRepository.
 *
 * The upload path uses ValidationContextBuilder.fromEntities() which bypasses
 * this repository entirely — entities are already in memory after parsing.
 */
export class TypeOrmValidationQueryRepository implements ValidationQueryRepository {
  private readonly preferencesRepo: TypeOrmValidationPreferencesRepository;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.preferencesRepo = new TypeOrmValidationPreferencesRepository(
      dataSource,
    );
  }

  // TODO: add async when real DB query is implemented
  findModulesByFile(_fileSystemId: number): Promise<SpfModule[]> {
    return Promise.resolve([]);
  }

  // TODO: add async when real DB query is implemented
  findUsecasesByFile(_fileSystemId: number): Promise<UseCase[]> {
    return Promise.resolve([]);
  }

  // TODO: add async when real DB query is implemented
  findSubgraphsByFile(_fileSystemId: number): Promise<Subgraph[]> {
    return Promise.resolve([]);
  }

  // TODO: add async when real DB query is implemented
  findDataLinksByFile(_fileSystemId: number): Promise<DataLink[]> {
    return Promise.resolve([]);
  }

  // TODO: add async when real DB query is implemented
  findControlLinksByFile(_fileSystemId: number): Promise<ControlLink[]> {
    return Promise.resolve([]);
  }

  // TODO: add async when real DB query is implemented
  findDefinitionsByFile(_fileSystemId: number): Promise<SpfModuleDefinition[]> {
    return Promise.resolve([]);
  }

  async getPreferences(fileSystemId: number): Promise<ValidationPreferences> {
    return this.preferencesRepo
      .getPreferences(fileSystemId)
      .catch(() => EMPTY_PREFERENCES);
  }

  async findStoredDataLossIssues(
    fileSystemId: number,
  ): Promise<ValidationIssue[]> {
    const row = await this.dataSource
      .getRepository<ArcDbFileRow>(ArcDbFileSchema)
      .findOne({
        where: {systemId: fileSystemId},
        select: ['dataLossIssues'],
      });

    if (!row?.dataLossIssues) return [];

    try {
      return JSON.parse(row.dataLossIssues) as ValidationIssue[];
    } catch {
      return [];
    }
  }
}
