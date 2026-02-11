/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BulkImportRepository,
  SpfModule,
  Container,
  DataLink,
  ControlLink,
  ModuleDefinition,
  KeyDefinition,
  ProcessorDefinition,
  Subgraph,
  ContainerType,
  BulkEntityInsertResult,
  UseCase,
  BulkModuleInsertResult,
  BulkDataLinkInsertResult,
  BulkControlLinkInsertResult,
  BulkModuleDefinitionInsertResult,
  BulkKeyDefinitionInsertResult,
} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {KeyDefinitionInserter} from './key-definition/key-definition.inserter.js';
import {UseCaseInserter} from './usecase/usecase.inserter.js';
import {SubgraphInserter} from './subgraph/subgraph.inserter.js';
import {ContainerInserter} from './container/container.inserter.js';
import {DataLinkInserter} from './data-link/data-link.inserter.js';
import {ControlLinkInserter} from './control-link/control-link.inserter.js';
import {ModuleDefinitionInserter} from './module-definition/module-definition.inserter.js';
import {SpfModuleInserter} from './spf-module/spf-module.inserter.js';

/**
 * TypeORM implementation of BulkImportRepository.
 * Uses EntityManager from UOW's QueryRunner for consistent connection management.
 */
export class TypeOrmBulkImportRepository implements BulkImportRepository {
  constructor(private readonly manager: EntityManager) {}

  async insertSpfModules(
    items: readonly Omit<SpfModule, 'systemId'>[],
  ): Promise<BulkModuleInsertResult> {
    const inserter = new SpfModuleInserter(this.manager);
    return await inserter.insert(items as readonly SpfModule[]);
  }

  async insertContainers(
    items: readonly Omit<Container, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    const inserter = new ContainerInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertSubgraphs(
    items: readonly Omit<Subgraph, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    const inserter = new SubgraphInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertDataLinks(
    items: readonly Omit<DataLink, 'systemId'>[],
  ): Promise<BulkDataLinkInsertResult> {
    const inserter = new DataLinkInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertControlLinks(
    items: readonly Omit<ControlLink, 'systemId'>[],
  ): Promise<BulkControlLinkInsertResult> {
    const inserter = new ControlLinkInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertUseCases(
    items: readonly Omit<UseCase, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    const inserter = new UseCaseInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertModuleDefinitions(
    items: readonly Omit<ModuleDefinition, 'systemId'>[],
  ): Promise<BulkModuleDefinitionInsertResult> {
    const inserter = new ModuleDefinitionInserter(this.manager);
    return await inserter.insert(items);
  }

  async insertKeyDefinitions(
    items: readonly Omit<KeyDefinition, 'systemId'>[],
  ): Promise<BulkKeyDefinitionInsertResult> {
    const inserter = new KeyDefinitionInserter(this.manager);
    return await inserter.insert(items);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async insertProcessorDefinitions(
    items: readonly Omit<ProcessorDefinition, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertProcessorDefinitions not yet implemented. ' +
        `Attempted to insert ${items.length} processor definitions.`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async insertContainerTypeDefinitions(
    items: readonly Omit<ContainerType, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertContainerTypeDefinitions not yet implemented. ' +
        `Attempted to insert ${items.length} container type definitions.`,
    );
  }
}
