/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ValidationQueryRepository,
  ValidationPreferences,
  ValidationIssue,
  UseCase,
  Subgraph,
  DataLink,
  ControlLink,
  SpfModuleDefinition,
} from '@arc/core';
import {EMPTY_PREFERENCES, SpfModule, KvData} from '@arc/core';
import {TypeOrmValidationPreferencesRepository} from './typeorm-validation-preferences.repository.js';
import {ArcDbFileSchema} from '../../entity-schema/project-data/arc-db-file.schema.js';
import type {ArcDbFileRow} from '../../entity-schema/project-data/arc-db-file.schema.js';
import {SpfModuleSchema} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {CkvRow} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

const CHUNK_SIZE = 999;

/**
 * TypeORM implementation of ValidationQueryRepository.
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

  async findModulesByFile(fileSystemId: number): Promise<SpfModule[]> {
    const moduleRows = await this.dataSource
      .getRepository<SpfModuleRow>(SpfModuleSchema)
      .find({where: {fileSystemId}});

    if (moduleRows.length === 0) return [];

    const moduleIds = moduleRows.map(r => r.systemId);
    const ckvRows: CkvRow[] = [];

    for (let i = 0; i < moduleIds.length; i += CHUNK_SIZE) {
      const chunk = moduleIds.slice(i, i + CHUNK_SIZE);
      const rows = (await this.dataSource
        .getRepository(ENTITY_NAMES.Ckv)
        .createQueryBuilder('ckv')
        .leftJoinAndSelect('ckv.values', 'ckvValues')
        .where('ckv.spfModuleSystemId IN (:...ids)', {ids: chunk})
        .getMany()) as CkvRow[];
      ckvRows.push(...rows);
    }

    const ckvsByModule = new Map<number, CkvRow[]>();
    for (const ckv of ckvRows) {
      const existing = ckvsByModule.get(ckv.spfModuleSystemId) ?? [];
      existing.push(ckv);
      ckvsByModule.set(ckv.spfModuleSystemId, existing);
    }

    return moduleRows.map(row => {
      const module = new SpfModule({
        systemId: row.systemId,
        naturalId: row.naturalId,
        alias: row.alias ?? undefined,
        definitionSystemId: row.definitionSystemId,
        containerSystemId: row.containerSystemId,
        subgraphSystemId: row.subgraphSystemId,
        fileSystemId: row.fileSystemId,
        dataPorts: [],
        controlPorts: [],
      });
      for (const ckv of ckvsByModule.get(row.systemId) ?? []) {
        module.addModuleCkv(
          new KvData({
            systemId: ckv.systemId,
            valueDefinitionSystemIds: (ckv.values ?? []).map(
              v => v.valueDefSystemId,
            ),
            uiPersistence: ckv.uiPersistence ?? null,
          }),
        );
      }
      return module;
    });
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
