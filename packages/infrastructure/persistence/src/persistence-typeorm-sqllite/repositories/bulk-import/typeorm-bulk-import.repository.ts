/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BulkImportRepository,
  BulkInsertResult,
  Container,
  ContainerType,
  ControlLink,
  DataLink,
  IdGenerationPort,
  KeyDefinition,
  Node,
  ProcessorDefinition,
  SpfModule,
  SpfModuleDefinition,
  Subgraph,
  UseCase,
} from '@arc/core';
import {okBulkInsert} from '@arc/core';
import {SpfModuleInserter} from './spf-module/spf-module.inserter.js';
import {ContainerInserter} from './container/container.inserter.js';
import {SubgraphInserter} from './subgraph/subgraph.inserter.js';
import {UseCaseInserter} from './usecase/usecase.inserter.js';
import {SubsystemInserter} from './subsystem/subsystem.inserter.js';

/**
 * TypeORM implementation of BulkImportRepository.
 *
 * Uses the shared EntityManager (from the active QueryRunner / Unit of Work)
 * and the IdGenerationPort for assigning surrogate PKs to new entities.
 *
 * Only SpfModule insertion is fully implemented. All other methods are stubs
 * returning okBulkInsert() until their concrete inserters are built.
 */
export class TypeOrmBulkImportRepository implements BulkImportRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  insertSpfModules(items: SpfModule[]): Promise<BulkInsertResult> {
    return new SpfModuleInserter(this.manager, this.idGeneration).insert(items);
  }

  insertContainers(items: Container[]): Promise<BulkInsertResult> {
    return new ContainerInserter(this.manager, this.idGeneration).insert(items);
  }

  insertSubgraphs(items: readonly Subgraph[]): Promise<BulkInsertResult> {
    return new SubgraphInserter(this.manager, this.idGeneration).insert([
      ...items,
    ]);
  }

  insertSubsystems(items: readonly Node[]): Promise<BulkInsertResult> {
    return new SubsystemInserter(this.manager, this.idGeneration).insert([
      ...items,
    ]);
  }

  insertDataLinks(_items: readonly DataLink[]): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }

  insertControlLinks(
    _items: readonly ControlLink[],
  ): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }

  insertUseCases(items: readonly UseCase[]): Promise<BulkInsertResult> {
    return new UseCaseInserter(this.manager, this.idGeneration).insert([
      ...items,
    ]);
  }

  insertSpfModuleDefinitions(
    _items: readonly SpfModuleDefinition[],
  ): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }

  insertKeyDefinitions(
    _items: readonly KeyDefinition[],
  ): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }

  insertProcessorDefinitions(
    _items: readonly ProcessorDefinition[],
  ): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }

  insertContainerTypeDefinitions(
    _items: readonly ContainerType[],
  ): Promise<BulkInsertResult> {
    return Promise.resolve(okBulkInsert());
  }
}
