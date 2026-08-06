/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {ISessionRepository} from '@arc/core';
import type {ContainerPropertyBase} from '../../entity-schema/definitions/container/container-property-definition.schema.js';

const overlay = new OverlayMergeImpl();

export class ContainerPropertyDefinitionFetcher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  async fetchAll(fileSystemId: number): Promise<ContainerPropertyBase[]> {
    const baselineRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ContainerProperty)
      .createQueryBuilder('cp')
      .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as ContainerPropertyBase[];

    const session =
      await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);

    if (!session) return baselineRows;

    return overlay
      .applyToCollection(
        baselineRows as unknown as Array<{systemId: number}>,
        await this.editActionsSvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.ContainerProperty,
        ),
      )
      .map(r => r.effective as unknown as ContainerPropertyBase);
  }
}
