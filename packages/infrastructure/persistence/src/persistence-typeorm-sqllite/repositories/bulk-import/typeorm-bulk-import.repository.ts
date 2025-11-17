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
    throw new Error(
      'BulkImportRepository.insertSpfModules not yet implemented. ' +
        `Attempted to insert ${items.length} SPF modules.`,
    );
  }

  async insertContainers(
    items: readonly Omit<Container, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertContainers not yet implemented. ' +
        `Attempted to insert ${items.length} containers.`,
    );
  }

  async insertSubgraphs(
    items: readonly Omit<Subgraph, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      'BulkImportRepository.insertSubgraphs not yet implemented. ' +
        `Attempted to insert ${items.length} subgraphs.`,
    );
  }

  async insertDataLinks(
    items: readonly Omit<DataLink, 'systemId'>[],
  ): Promise<BulkDataLinkInsertResult> {
    throw new Error(
      'BulkImportRepository.insertDataLinks not yet implemented. ' +
        `Attempted to insert ${items.length} data links.`,
    );
  }

  async insertControlLinks(
    items: readonly Omit<ControlLink, 'systemId'>[],
  ): Promise<BulkControlLinkInsertResult> {
    throw new Error(
      'BulkImportRepository.insertControlLinks not yet implemented. ' +
        `Attempted to insert ${items.length} control links.`,
    );
  }

  insertUseCases(
    items: readonly Omit<UseCase, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>> {
    throw new Error(
      `BulkImportRepository.insertUseCases ${items.length} not yet implemented. `,
    );
  }

  async insertModuleDefinitions(
    items: readonly Omit<ModuleDefinition, 'systemId'>[],
  ): Promise<BulkModuleDefinitionInsertResult> {
    throw new Error(
      'BulkImportRepository.insertModuleDefinitions not yet implemented. ' +
        `Attempted to insert ${items.length} module definitions.`,
    );
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
