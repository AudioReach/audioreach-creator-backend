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
import type {ContainerBase} from '../entity-schema/usecase-data/container/container.schema.js';
import type {ContainerPropertyDataBase} from '../entity-schema/usecase-data/container/container-property-data.js';

// Query-ready superset types.
export interface OverlaidContainerProperty {
  systemId: number;
  containerSystemId: number;
  propertySystemId: number;
  payload: unknown;
}

export interface OverlaidContainer {
  systemId: number;
  containerId: number;
  containerTypeSystemId: number;
  fileSystemId: number;
  properties: OverlaidContainerProperty[];
}

export class ContainerOverlayFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchOne(
    containerSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidContainer | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.Container)
      .createQueryBuilder('c')
      .select([
        'c.systemId',
        'c.containerId',
        'c.containerTypeSystemId',
        'c.fileSystemId',
      ])
      .where(
        'c.systemId = :containerSystemId AND c.fileSystemId = :fileSystemId',
        {containerSystemId, fileSystemId},
      )
      .getOne()) as unknown as ContainerBase | null;

    // Load base property rows (only if base container exists)
    let basePropRows: ContainerPropertyDataBase[] = [];
    if (baseRow !== null) {
      basePropRows = (await this.manager
        .getRepository(ENTITY_NAMES.ContainerPropertyData)
        .createQueryBuilder('cpd')
        .select([
          'cpd.systemId',
          'cpd.containerSystemId',
          'cpd.propertySystemId',
          'cpd.payload',
        ])
        .where('cpd.containerSystemId = :containerSystemId', {
          containerSystemId,
        })
        .getMany()) as unknown as ContainerPropertyDataBase[];
    }

    if (sessionId === null) {
      if (baseRow === null) return null;
      return this.assembleContainer(
        baseRow,
        basePropRows.map(p => ({
          systemId: p.systemId,
          containerSystemId: p.containerSystemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload,
        })),
      );
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      containerSystemId,
    );
    const containerActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.Container,
    );
    const propActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.ContainerPropertyData,
    );

    // Check for CREATE action (auto-create case — no base row exists yet)
    const createAction = containerActions.find(
      a => a.operation === CHANGE_OPERATION.Create,
    );
    if (baseRow === null) {
      if (!createAction) return null;
      // Build container from CREATE payload, injecting systemId from targetSystemId
      const payload = createAction.newValue as Partial<ContainerBase>;
      const createdContainer: ContainerBase = {
        systemId: createAction.targetSystemId,
        containerId: payload.containerId ?? 0,
        containerTypeSystemId: payload.containerTypeSystemId ?? 0,
        fileSystemId: payload.fileSystemId ?? fileSystemId,
      };
      // Also apply any CREATE-staged properties
      const createdProps = this.buildCreatedProperties(
        propActions,
        containerSystemId,
      );
      return this.assembleContainer(createdContainer, createdProps);
    }

    // Apply overlay to the existing container row
    const overlaidContainer = applyTableOverlay(
      baseRow as unknown as {systemId: number},
      containerActions,
      ENTITY_NAMES.Container,
    ) as ContainerBase | null;

    if (overlaidContainer === null) return null;

    // Apply overlay to properties (CREATE, UPDATE, DELETE)
    const overlaidProps = this.overlay.applyToCollection(
      basePropRows as unknown as Array<{systemId: number}>,
      propActions,
    );

    // Handle CREATE-staged properties that don't exist in base
    const basePropIds = new Set(basePropRows.map(p => p.systemId));
    const createdProps = this.buildCreatedProperties(
      propActions.filter(a => !basePropIds.has(a.targetSystemId)),
      containerSystemId,
    );

    const survivingProps: OverlaidContainerProperty[] = [
      ...overlaidProps.map(r => {
        const p = r.effective as unknown as ContainerPropertyDataBase;
        return {
          systemId: p.systemId,
          containerSystemId: p.containerSystemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload,
        };
      }),
      ...createdProps,
    ];

    return {
      systemId: overlaidContainer.systemId,
      containerId: overlaidContainer.containerId,
      containerTypeSystemId: overlaidContainer.containerTypeSystemId,
      fileSystemId: overlaidContainer.fileSystemId,
      properties: survivingProps,
    };
  }

  private buildCreatedProperties(
    propActions: EditActionRow[],
    containerSystemId: number,
  ): OverlaidContainerProperty[] {
    return propActions
      .filter(a => a.operation === CHANGE_OPERATION.Create)
      .map(a => {
        const payload = a.newValue as Partial<ContainerPropertyDataBase>;
        return {
          systemId: a.targetSystemId,
          containerSystemId: payload.containerSystemId ?? containerSystemId,
          propertySystemId: payload.propertySystemId ?? 0,
          payload: payload.payload ?? null,
        };
      });
  }

  private assembleContainer(
    container: ContainerBase,
    props: OverlaidContainerProperty[],
  ): OverlaidContainer {
    return {
      systemId: container.systemId,
      containerId: container.containerId,
      containerTypeSystemId: container.containerTypeSystemId,
      fileSystemId: container.fileSystemId,
      properties: props,
    };
  }
}
