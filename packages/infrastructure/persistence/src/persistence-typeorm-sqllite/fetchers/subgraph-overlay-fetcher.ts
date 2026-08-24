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
import type {SubgraphBase} from '../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataBase} from '../entity-schema/usecase-data/subgraph/subgraph-property-data.js';

export interface OverlaidSubgraphProperty {
  systemId: number;
  subgraphSystemId: number;
  propertySystemId: number;
  payload: unknown;
}

export interface OverlaidSgkv {
  systemId: number;
  subgraphSystemId: number;
  values: {valueDefSystemId: number}[];
}

export interface OverlaidSubgraph {
  systemId: number;
  subgraphId: number;
  name: string;
  isImported: boolean;
  fileSystemId: number;
  properties: OverlaidSubgraphProperty[];
}

export class SubgraphOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSubgraph | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select([
        's.systemId',
        's.subgraphId',
        's.name',
        's.isImported',
        's.fileSystemId',
      ])
      .where(
        's.systemId = :subgraphSystemId AND s.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getOne()) as unknown as SubgraphBase | null;

    // Load base property rows (only if base subgraph exists)
    let basePropRows: SubgraphPropertyDataBase[] = [];
    if (baseRow !== null) {
      basePropRows = (await this.manager
        .getRepository(ENTITY_NAMES.SubgraphPropertyData)
        .createQueryBuilder('spd')
        .select([
          'spd.systemId',
          'spd.subgraphSystemId',
          'spd.subgraphPropertySystemId',
          'spd.payload',
        ])
        .where('spd.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
        .getMany()) as unknown as SubgraphPropertyDataBase[];
    }

    if (sessionId === null) {
      if (baseRow === null) return null;
      return this.assembleSubgraph(
        baseRow,
        basePropRows.map(p => this.toOverlaidProperty(p)),
      );
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const subgraphActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.Subgraph,
    );
    const propActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.SubgraphPropertyData,
    );

    // Check for CREATE action (auto-create case — no base row exists yet)
    const createAction = subgraphActions.find(
      a => a.operation === CHANGE_OPERATION.Create,
    );
    if (baseRow === null) {
      if (!createAction) return null;
      const payload = createAction.newValue as Partial<SubgraphBase>;
      const createdSubgraph: SubgraphBase = {
        systemId: createAction.targetSystemId,
        subgraphId: payload.subgraphId ?? 0,
        name: payload.name ?? '',
        isImported: payload.isImported ?? false,
        fileSystemId: payload.fileSystemId ?? fileSystemId,
      };
      const createdProps = this.buildCreatedProperties(
        propActions,
        subgraphSystemId,
      );
      return this.assembleSubgraph(createdSubgraph, createdProps);
    }

    // Apply overlay to the existing subgraph row
    const overlaidSubgraph = applyTableOverlay(
      baseRow as unknown as {systemId: number},
      subgraphActions,
      ENTITY_NAMES.Subgraph,
    ) as SubgraphBase | null;

    if (overlaidSubgraph === null) return null;

    // Apply overlay to properties (CREATE, UPDATE, DELETE)
    const overlaidProps = this.overlay.applyToCollection(
      basePropRows as unknown as Array<{systemId: number}>,
      propActions,
    );

    // Handle CREATE-staged properties that don't exist in base
    const basePropIds = new Set(basePropRows.map(p => p.systemId));
    const createdProps = this.buildCreatedProperties(
      propActions.filter(a => !basePropIds.has(a.targetSystemId)),
      subgraphSystemId,
    );

    const survivingProps: OverlaidSubgraphProperty[] = [
      ...overlaidProps.map(r =>
        this.toOverlaidProperty(
          r.effective as unknown as SubgraphPropertyDataBase,
        ),
      ),
      ...createdProps,
    ];

    return this.assembleSubgraph(overlaidSubgraph, survivingProps);
  }

  private toOverlaidProperty(
    p: SubgraphPropertyDataBase,
  ): OverlaidSubgraphProperty {
    return {
      systemId: p.systemId,
      subgraphSystemId: p.subgraphSystemId,
      propertySystemId: p.subgraphPropertySystemId,
      payload: p.payload,
    };
  }

  private buildCreatedProperties(
    propActions: EditActionRow[],
    subgraphSystemId: number,
  ): OverlaidSubgraphProperty[] {
    return propActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a => {
        const payload = a.newValue as Partial<SubgraphPropertyDataBase>;
        return {
          systemId: a.targetSystemId,
          subgraphSystemId: payload.subgraphSystemId ?? subgraphSystemId,
          propertySystemId: payload.subgraphPropertySystemId ?? 0,
          payload: payload.payload ?? null,
        };
      });
  }

  private assembleSubgraph(
    subgraph: SubgraphBase,
    props: OverlaidSubgraphProperty[],
  ): OverlaidSubgraph {
    return {
      systemId: subgraph.systemId,
      subgraphId: subgraph.subgraphId,
      name: subgraph.name,
      isImported: subgraph.isImported,
      fileSystemId: subgraph.fileSystemId,
      properties: props,
    };
  }

  async getSubgraphs(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<SubgraphBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('s')
      .select([
        's.systemId',
        's.subgraphId',
        's.name',
        's.isImported',
        's.fileSystemId',
      ])
      .where('s.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as SubgraphBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Subgraph,
    );
    if (actions.length === 0) return baseRows;

    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => r.effective);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: SubgraphBase[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<SubgraphBase>;
        return {
          systemId: a.targetSystemId,
          subgraphId: p.subgraphId ?? 0,
          name: p.name ?? '',
          isImported: p.isImported ?? false,
          fileSystemId: p.fileSystemId ?? fileSystemId,
        };
      });

    return [...overlaid, ...created];
  }

  async getSgkvs(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidSgkv[]> {
    type SgkvBaseRow = {
      systemId: number;
      subgraphSystemId: number;
      values?: {valueDefSystemId: number}[];
    };

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.Sgkv)
      .createQueryBuilder('sgkv')
      .innerJoin('sgkv.subgraph', 's', 's.fileSystemId = :fileSystemId', {
        fileSystemId,
      })
      .leftJoinAndSelect('sgkv.values', 'vals')
      .getMany()) as unknown as SgkvBaseRow[];

    const toOverlaid = (r: SgkvBaseRow): OverlaidSgkv => ({
      systemId: r.systemId,
      subgraphSystemId: r.subgraphSystemId,
      values: (r.values ?? []).map(v => ({
        valueDefSystemId: v.valueDefSystemId,
      })),
    });

    if (sessionId === null) return baseRows.map(r => toOverlaid(r));

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.Sgkv,
    );
    if (actions.length === 0) return baseRows.map(r => toOverlaid(r));

    const updateDeleteActions = actions.filter(
      a => a.operation !== CHANGE_OPERATION.Create,
    );
    const baseIds = new Set(baseRows.map(r => r.systemId));

    const overlaid = this.overlay
      .applyToCollection(baseRows, updateDeleteActions)
      .map(r => toOverlaid(r.effective));

    const created: OverlaidSgkv[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<{subgraphSystemId: number}>;
        return {
          systemId: a.targetSystemId,
          subgraphSystemId: p.subgraphSystemId ?? 0,
          values: [],
        };
      });

    return [...overlaid, ...created];
  }
}
