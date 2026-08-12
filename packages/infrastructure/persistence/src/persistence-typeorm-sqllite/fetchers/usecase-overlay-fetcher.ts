/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {applyTableOverlay} from '../queries/edit-session/overlay-utils.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../entity-schema/edit-session/edit-action.schema.js';
import type {UseCaseBase} from '../entity-schema/usecase-data/use-case.js';
import type {UsecaseType} from '@arc/core';

export interface OverlaidUsecaseGkvEntry {
  usecaseSystemId: number;
  valueDefSystemId: number;
}

export interface OverlaidUseCase {
  systemId: number;
  aliasId: number;
  alias: string;
  fileSystemId: number;
  type: UsecaseType | null;
  gkvEntries: OverlaidUsecaseGkvEntry[];
  categoryNames: string[];
}

export class UsecaseOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    usecaseSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidUseCase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .select([
        'uc.systemId',
        'uc.aliasId',
        'uc.alias',
        'uc.fileSystemId',
        'uc.type',
      ])
      .where(
        'uc.systemId = :usecaseSystemId AND uc.fileSystemId = :fileSystemId',
        {usecaseSystemId, fileSystemId},
      )
      .getOne()) as unknown as UseCaseBase | null;

    let baseGkvRows: OverlaidUsecaseGkvEntry[] = [];
    if (baseRow !== null) {
      baseGkvRows = (await this.manager
        .getRepository(ENTITY_NAMES.UsecaseGkvValues)
        .createQueryBuilder('gkv')
        .select(['gkv.usecaseSystemId', 'gkv.valueDefSystemId'])
        .where('gkv.usecaseSystemId = :usecaseSystemId', {usecaseSystemId})
        .getMany()) as unknown as OverlaidUsecaseGkvEntry[];
    }

    let baseCategoryNames: string[] = [];
    if (baseRow !== null) {
      const catRows: Array<{cat_name: string}> = await this.manager
        .getRepository(ENTITY_NAMES.UseCase)
        .createQueryBuilder('uc')
        .innerJoin('uc.categories', 'cat')
        .select('cat.name')
        .where('uc.systemId = :usecaseSystemId', {usecaseSystemId})
        .getRawMany();
      baseCategoryNames = catRows.map(r => r.cat_name);
    }

    if (sessionId === null) {
      if (baseRow === null) return null;
      return this.assembleUsecase(baseRow, baseGkvRows, baseCategoryNames);
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      usecaseSystemId,
    );
    const usecaseActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.UseCase,
    );
    const gkvActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.UsecaseGkvValues,
    );
    const categoryActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.UseCaseCategory,
    );

    if (baseRow === null) {
      const createAction = usecaseActions.find(
        a => a.operation === CHANGE_OPERATION.Create,
      );
      if (!createAction) return null;
      const p = createAction.newValue as Partial<UseCaseBase>;
      const created: UseCaseBase = {
        systemId: createAction.targetSystemId,
        aliasId: p.aliasId ?? 0,
        alias: p.alias ?? '',
        fileSystemId: p.fileSystemId ?? fileSystemId,
        type: p.type,
      };
      return this.assembleUsecase(
        created,
        this.applyGkvOverlay([], gkvActions, usecaseSystemId),
        this.applyCategoryOverlay([], categoryActions),
      );
    }

    const overlaidUsecase = applyTableOverlay(
      baseRow as unknown as {systemId: number},
      usecaseActions,
      ENTITY_NAMES.UseCase,
    ) as UseCaseBase | null;
    if (overlaidUsecase === null) return null;

    return this.assembleUsecase(
      overlaidUsecase,
      this.applyGkvOverlay(baseGkvRows, gkvActions, usecaseSystemId),
      this.applyCategoryOverlay(baseCategoryNames, categoryActions),
    );
  }

  async applyToUsecases(
    fileSystemId: number,
    sessionId: number | null,
    restrictToIds?: number[],
  ): Promise<OverlaidUseCase[]> {
    let qb = this.manager
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .select([
        'uc.systemId',
        'uc.aliasId',
        'uc.alias',
        'uc.fileSystemId',
        'uc.type',
      ])
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId});

    if (restrictToIds && restrictToIds.length > 0) {
      qb = qb.andWhere('uc.systemId IN (:...ids)', {ids: restrictToIds});
    }

    const baseRows = (await qb.getMany()) as unknown as UseCaseBase[];

    if (baseRows.length === 0 && sessionId === null) return [];

    const baseGkvRows =
      baseRows.length > 0
        ? ((await this.manager
            .getRepository(ENTITY_NAMES.UsecaseGkvValues)
            .createQueryBuilder('gkv')
            .select(['gkv.usecaseSystemId', 'gkv.valueDefSystemId'])
            .where('gkv.usecaseSystemId IN (:...ids)', {
              ids: baseRows.map(r => r.systemId),
            })
            .getMany()) as unknown as OverlaidUsecaseGkvEntry[])
        : [];

    const baseCategoryRows: Array<{uc_system_id: number; cat_name: string}> =
      baseRows.length > 0
        ? await this.manager
            .getRepository(ENTITY_NAMES.UseCase)
            .createQueryBuilder('uc')
            .innerJoin('uc.categories', 'cat')
            .select(['uc.systemId', 'cat.name'])
            .where('uc.systemId IN (:...ids)', {
              ids: baseRows.map(r => r.systemId),
            })
            .getRawMany()
        : [];

    if (sessionId === null) {
      const gkvMap = this.groupGkvByUsecase(baseGkvRows);
      const catMap = this.groupCategoriesByUsecase(baseCategoryRows);
      return baseRows.map(r =>
        this.assembleUsecase(
          r,
          gkvMap.get(r.systemId) ?? [],
          catMap.get(r.systemId) ?? [],
        ),
      );
    }

    const [ucActions, gkvActions, catActions] = await Promise.all([
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UseCase),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UsecaseGkvValues),
      this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.UseCaseCategory),
    ]);

    const updateDeleteActions = ucActions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: UseCaseBase[] = ucActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<UseCaseBase>;
        return {
          systemId: a.targetSystemId,
          aliasId: p.aliasId ?? 0,
          alias: p.alias ?? '',
          fileSystemId: p.fileSystemId ?? fileSystemId,
          type: p.type,
        };
      });

    const allUsecases = [...overlaid, ...created];
    const gkvMap = this.groupGkvByUsecase(baseGkvRows);
    const catMap = this.groupCategoriesByUsecase(baseCategoryRows);

    return allUsecases.map(uc => {
      const ucGkvActions = gkvActions.filter(a => {
        const p = a.newValue as Partial<{usecaseSystemId: number}>;
        return p.usecaseSystemId === uc.systemId;
      });
      const ucCatActions = catActions.filter(a => {
        const p = a.newValue as Partial<{usecaseSystemId: number}>;
        return p.usecaseSystemId === uc.systemId;
      });
      return this.assembleUsecase(
        uc,
        this.applyGkvOverlay(
          gkvMap.get(uc.systemId) ?? [],
          ucGkvActions,
          uc.systemId,
        ),
        this.applyCategoryOverlay(catMap.get(uc.systemId) ?? [], ucCatActions),
      );
    });
  }

  private applyGkvOverlay(
    baseEntries: OverlaidUsecaseGkvEntry[],
    actions: EditActionRow[],
    usecaseSystemId: number,
  ): OverlaidUsecaseGkvEntry[] {
    let entries = [...baseEntries];
    for (const a of actions) {
      const p = a.newValue as Partial<{valueDefSystemId: number}>;
      if (!p.valueDefSystemId) continue;
      if (a.operation === CHANGE_OPERATION.Create) {
        if (!entries.some(e => e.valueDefSystemId === p.valueDefSystemId))
          entries.push({usecaseSystemId, valueDefSystemId: p.valueDefSystemId});
      } else if (a.operation === CHANGE_OPERATION.Delete) {
        entries = entries.filter(
          e => e.valueDefSystemId !== p.valueDefSystemId,
        );
      }
    }
    return entries;
  }

  private applyCategoryOverlay(
    baseNames: string[],
    actions: EditActionRow[],
  ): string[] {
    let names = [...baseNames];
    for (const a of actions) {
      const p = a.newValue as Partial<{name: string}>;
      if (!p.name) continue;
      if (a.operation === CHANGE_OPERATION.Create) {
        if (!names.includes(p.name)) names.push(p.name);
      } else if (a.operation === CHANGE_OPERATION.Delete) {
        names = names.filter(n => n !== p.name);
      }
    }
    return names;
  }

  private groupGkvByUsecase(
    rows: OverlaidUsecaseGkvEntry[],
  ): Map<number, OverlaidUsecaseGkvEntry[]> {
    const map = new Map<number, OverlaidUsecaseGkvEntry[]>();
    for (const row of rows) {
      const list = map.get(row.usecaseSystemId) ?? [];
      list.push(row);
      map.set(row.usecaseSystemId, list);
    }
    return map;
  }

  private groupCategoriesByUsecase(
    rows: Array<{uc_system_id: number; cat_name: string}>,
  ): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const row of rows) {
      const list = map.get(row.uc_system_id) ?? [];
      list.push(row.cat_name);
      map.set(row.uc_system_id, list);
    }
    return map;
  }

  private assembleUsecase(
    uc: UseCaseBase,
    gkvEntries: OverlaidUsecaseGkvEntry[],
    categoryNames: string[],
  ): OverlaidUseCase {
    return {
      systemId: uc.systemId,
      aliasId: uc.aliasId,
      alias: uc.alias,
      fileSystemId: uc.fileSystemId,
      type: uc.type ?? null,
      gkvEntries,
      categoryNames,
    };
  }
}
