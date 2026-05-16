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
  PropertyDefinition,
  SpfModule,
  SpfModuleDefinition,
  Subgraph,
  SubgraphPropertyDefinition,
  TagDefinition,
  UseCase,
  VcpmModuleDefinition,
} from '@arc/core';
import {SpfModuleInserter} from './spf-module/spf-module.inserter.js';
import {SpfModuleDefinitionInserter} from './spf-module-definition/spf-module-definition.inserter.js';
import {ContainerInserter} from './container/container.inserter.js';
import {SubgraphInserter} from './subgraph/subgraph.inserter.js';
import {SubsystemInserter} from './subsystem/subsystem.inserter.js';
import {ProcessorDefinitionInserter} from './processor-definition/processor-definition.inserter.js';
import {ContainerTypeInserter} from './container-type/container-type.inserter.js';
import {KeyDefinitionInserter} from './key-definition/key-definition.inserter.js';
import {TagDefinitionInserter} from './tag-definition/tag-definition.inserter.js';
import {VcpmModuleDefinitionInserter} from './vcpm-module-definition/vcpm-module-definition.inserter.js';
import {SubgraphPropertyDefinitionInserter} from './subgraph-property-definition/subgraph-property-definition.inserter.js';
import {ContainerPropertyDefinitionInserter} from './container-property-definition/container-property-definition.inserter.js';
import {DataLinkInserter} from './data-link/data-link.inserter.js';
import {ControlLinkInserter} from './control-link/control-link.inserter.js';
import {UsecaseInserter} from './usecase/usecase.inserter.js';

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
    return new SubsystemInserter(this.manager).insert([...items]);
  }

  insertDataLinks(items: readonly DataLink[]): Promise<BulkInsertResult> {
    return new DataLinkInserter(this.manager).insert([...items]);
  }

  insertControlLinks(items: readonly ControlLink[]): Promise<BulkInsertResult> {
    return new ControlLinkInserter(this.manager).insert([...items]);
  }

  insertUseCases(items: readonly UseCase[]): Promise<BulkInsertResult> {
    return new UsecaseInserter(this.manager).insert([...items]);
  }

  insertSpfModuleDefinitions(
    items: readonly SpfModuleDefinition[],
  ): Promise<BulkInsertResult> {
    return new SpfModuleDefinitionInserter(
      this.manager,
      this.idGeneration,
    ).insert([...items]);
  }

  insertKeyDefinitions(
    items: readonly KeyDefinition[],
  ): Promise<BulkInsertResult> {
    return new KeyDefinitionInserter(this.manager).insert([...items]);
  }

  insertProcessorDefinitions(
    items: readonly ProcessorDefinition[],
  ): Promise<BulkInsertResult> {
    return new ProcessorDefinitionInserter(this.manager).insert([...items]);
  }

  insertContainerTypeDefinitions(
    items: readonly ContainerType[],
  ): Promise<BulkInsertResult> {
    return new ContainerTypeInserter(this.manager).insert([...items]);
  }

  insertVcpmModuleDefinitions(
    items: readonly VcpmModuleDefinition[],
  ): Promise<BulkInsertResult> {
    return new VcpmModuleDefinitionInserter(
      this.manager,
      this.idGeneration,
    ).insert([...items]);
  }

  insertTagDefinitions(
    items: readonly TagDefinition[],
  ): Promise<BulkInsertResult> {
    return new TagDefinitionInserter(this.manager, this.idGeneration).insert([
      ...items,
    ]);
  }

  insertSubgraphPropertyDefinitions(
    items: readonly SubgraphPropertyDefinition[],
  ): Promise<BulkInsertResult> {
    return new SubgraphPropertyDefinitionInserter(this.manager).insert([
      ...items,
    ]);
  }

  insertContainerPropertyDefinitions(
    items: readonly PropertyDefinition[],
  ): Promise<BulkInsertResult> {
    return new ContainerPropertyDefinitionInserter(this.manager).insert([
      ...items,
    ]);
  }
}
