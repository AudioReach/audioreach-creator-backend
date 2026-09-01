/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {ContainerRepository, UnitOfWork, EditOptions} from '@arc/core';
import {Container, ContainerPropertyValue} from '@arc/core';
import type {PendingChangeWriter} from '../../services/pending-change-writer.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {ContainerOverlayFetcher} from '../../fetchers/container-overlay-fetcher.js';
import {ContainerPropertyDataFetcher} from '../../fetchers/container-property-data-fetcher.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

export class TypeOrmContainerRepository implements ContainerRepository {
  private readonly containerFetcher: ContainerOverlayFetcher;

  constructor(
    private readonly writer: PendingChangeWriter,
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.containerFetcher = new ContainerOverlayFetcher(
      manager,
      editActionsQs,
      new ContainerPropertyDataFetcher(manager, editActionsQs),
    );
  }

  async containerExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    return (
      (await this.containerFetcher.fetchOne(
        systemId,
        fileSystemId,
        sessionId,
      )) !== null
    );
  }

  async getContainerById(
    systemId: number,
    fileSystemId: number,
  ): Promise<Container | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.containerFetcher.fetchOne(
      systemId,
      fileSystemId,
      sessionId,
    );
    if (overlaid === null) return null;
    const container = new Container(
      overlaid.systemId,
      overlaid.containerId,
      overlaid.containerTypeSystemId,
      overlaid.fileSystemId,
    );
    for (const prop of overlaid.properties) {
      container.properties.set(
        prop.propertySystemId,
        new ContainerPropertyValue(prop.propertySystemId, prop.payload),
      );
    }
    return container;
  }

  async createContainer(
    container: Container,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();

    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.Container,
        targetSystemId: container.systemId,
        aggregateId: container.systemId,
        payload: {
          containerId: container.containerId,
          containerTypeSystemId: container.containerTypeSystemId,
          fileSystemId: container.fileSystemId,
        },
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );

    for (const [propDefSystemId, propVal] of container.properties) {
      await this.writer.writeCreate(
        {
          targetTable: ENTITY_NAMES.ContainerPropertyData,
          targetSystemId: container.systemId,
          aggregateId: container.systemId,
          payload: {
            containerSystemId: container.systemId,
            propertySystemId: propDefSystemId,
            payload: propVal.getPayloadCopy() ?? null,
          },
          ...options,
        },
        session.sessionId,
        groupId,
        this.manager,
      );
    }
  }

  async getPropertyData(
    containerSystemId: number,
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Uint8Array | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const overlaid = await this.containerFetcher.fetchOne(
      containerSystemId,
      fileSystemId,
      sessionId,
    );
    if (!overlaid) return null;
    const prop = overlaid.properties.find(
      p => p.propertySystemId === propertySystemId,
    );
    if (!prop || prop.payload == null) return null;
    return prop.payload;
  }

  async setPropertyData(
    containerSystemId: number,
    propertySystemId: number,
    data: Uint8Array,
    options?: EditOptions,
  ): Promise<void> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    // Use the fetcher only to resolve the property data row's systemId.
    // The blob (payload) is not read here — only the integer systemId matters.
    const overlaid = await this.containerFetcher.fetchOne(
      containerSystemId,
      fileSystemId,
      session.sessionId,
    );
    if (!overlaid) {
      throw new Error(
        `Container ${containerSystemId} not found in file ${fileSystemId}.`,
      );
    }
    const prop = overlaid.properties.find(
      p => p.propertySystemId === propertySystemId,
    );
    if (!prop) {
      throw new Error(
        `Container property ${propertySystemId} not found on container ` +
          `${containerSystemId}. Ensure the property is initialised at container creation.`,
      );
    }
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.ContainerPropertyData,
        targetSystemId: prop.systemId,
        aggregateId: containerSystemId,
        delta: {payload: data},
        ...options,
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }
}
