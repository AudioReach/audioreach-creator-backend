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
} from '@arc/core';
import type {QueryRunner} from 'typeorm';
import {KeyDefinitionInserter} from './key-definition/key-definition.inserter.js';
import {UseCaseInserter} from './usecase/usecase.inserter.js';
import {SubgraphInserter} from './subgraph/subgraph.inserter.js';
import {ContainerInserter} from './container/container.inserter.js';
import {DataLinkInserter} from './data-link/data-link.inserter.js';
import {ControlLinkInserter} from './control-link/control-link.inserter.js';
import {ModuleDefinitionInserter} from './module-definition/module-definition.inserter.js';
import {SpfModuleInserter} from './spf-module/spf-module.inserter.js';

// Import the specific result types from @arc/core
import type {
  BulkModuleInsertResult,
  BulkDataLinkInsertResult,
  BulkControlLinkInsertResult,
  BulkModuleDefinitionInsertResult,
  BulkKeyDefinitionInsertResult,
} from '@arc/core';

/**
 * TypeORM implementation of BulkImportRepository.
 * Uses QueryRunner for consistent transaction management.
 */
export class TypeOrmBulkImportRepository implements BulkImportRepository {
  constructor(private queryRunner: QueryRunner) {}

  async insertSpfModules(
    items: readonly Omit<SpfModule, 'systemId'>[],
  ): Promise<BulkModuleInsertResult> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new SpfModuleInserter(this.queryRunner.manager);
      // SpfModule domain entities already have instanceId for natural key identification
      return await inserter.insert(items as readonly SpfModule[]);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertContainers(
    items: readonly Omit<Container, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new ContainerInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertSubgraphs(
    items: readonly Omit<Subgraph, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new SubgraphInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertDataLinks(
    items: readonly Omit<DataLink, 'systemId'>[],
  ): Promise<BulkDataLinkInsertResult> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new DataLinkInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertControlLinks(
    items: readonly Omit<ControlLink, 'systemId'>[],
  ): Promise<BulkControlLinkInsertResult> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new ControlLinkInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertUseCases(
    items: readonly Omit<UseCase, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new UseCaseInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertModuleDefinitions(
    items: readonly Omit<ModuleDefinition, 'systemId'>[],
  ): Promise<BulkModuleDefinitionInsertResult> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new ModuleDefinitionInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertKeyDefinitions(
    items: readonly Omit<KeyDefinition, 'systemId'>[],
  ): Promise<BulkKeyDefinitionInsertResult> {
    // Connect QueryRunner for database operations
    await this.queryRunner.connect();

    try {
      const inserter = new KeyDefinitionInserter(this.queryRunner.manager);
      return await inserter.insert(items);
    } finally {
      // Always release QueryRunner to prevent connection leaks
      await this.queryRunner.release();
    }
  }

  async insertProcessorDefinitions(
    items: readonly Omit<ProcessorDefinition, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertProcessorDefinitions not yet implemented. ' +
        `Attempted to insert ${items.length} processor definitions.`,
    );
  }

  async insertContainerTypeDefinitions(
    items: readonly Omit<ContainerType, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertContainerTypeDefinitions not yet implemented. ' +
        `Attempted to insert ${items.length} container type definitions.`,
    );
  }
}
