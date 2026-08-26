/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionsRepository,
  SubgraphPropertyDefinitionRecord,
  ContainerPropertyDefinitionRecord,
} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {ContainerPropertyDefinitionFetcher} from '../../fetchers/definitions/container-property-definition-fetcher.js';

export class TypeOrmPropertyDefinitionsRepository implements PropertyDefinitionsRepository {
  private readonly containerPropertyDefinitionFetcher: ContainerPropertyDefinitionFetcher;

  constructor(
    manager: EntityManager,
    editActionsSvc = new EditActionsQueryService(manager),
  ) {
    this.containerPropertyDefinitionFetcher =
      new ContainerPropertyDefinitionFetcher(manager, editActionsSvc);
  }

  findSubgraphPropertyDefinitions(
    _fileSystemId: number,
  ): Promise<SubgraphPropertyDefinitionRecord[]> {
    // TODO(add-module-calibration-defaults): query subgraph_property_definitions
    // WHERE file_system_id = _fileSystemId and return {systemId, elementsStructure}.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §7
    return Promise.resolve([]);
  }

  findContainerPropertyDefinitions(
    _fileSystemId: number,
  ): Promise<ContainerPropertyDefinitionRecord[]> {
    // TODO(add-module-calibration-defaults): query container_property_definitions
    // WHERE file_system_id = _fileSystemId and return {systemId, propertyId, elementsStructure}.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §8
    return Promise.resolve([]);
  }

  async findContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<ContainerPropertyDefinitionRecord | null> {
    // Definitions are immutable reference data for command reads, so the
    // repository intentionally requests the baseline layer. Query handlers
    // resolve and pass an active session when overlay behavior is required.
    const row = await this.containerPropertyDefinitionFetcher.fetchOne(
      propertySystemId,
      fileSystemId,
      null,
    );

    if (row === null) return null;

    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      elementsStructure: row.elementsStructure ?? '',
    };
  }
}
