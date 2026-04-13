/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SpfModule,
  Container,
  DataLink,
  ControlLink,
  SpfModuleDefinition,
  KeyDefinition,
  ProcessorDefinition,
  Subgraph,
  ContainerType,
  UseCase,
} from '@arc/core';

import type {BulkInsertResult} from './bulk-import-interface/bulk-insert-result.interface.js';
import type {BaseInsertError} from './bulk-import-interface/base-insert-error.interface.js';

/**
 * Repository interface for bulk import operations using insert+query pattern.
 * All methods accept entities without systemId and return insertion reports with natural key mappings.
 * Success is determined by main table insert success; child failures are informational and do not cause rollback.
 */
export interface BulkImportRepository {
  /**
   * Insert SPF module instances in bulk, including CKV, TKV, and related entities.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns port mappings (data + control) needed for creating links.
   *
   * @param items - SPF modules without systemId (will be generated during insertion)
   * @returns Promise resolving to bulk module insertion result with instanceId->systemId mappings and port mappings
   *
   * @example
   * ```typescript
   * const modules: Omit<SpfModule, 'systemId'>[] = [
   *   { instanceId: 123, name: "AudioDecoder", ... }
   * ];
   * const result = await repository.insertSpfModules(modules);
   * const moduleSystemId = result.results[0].moduleIdMapping?.systemId;
   * const portSystemId = result.results[0].portMappings.dataPorts[0]?.systemId;
   * ```
   */
  insertSpfModules(
    items: SpfModule[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert container rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Containers without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with containerId->systemId mappings
   */
  insertContainers(
    items: readonly Container[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert subgraph rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Subgraphs without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with subgraphId->systemId mappings
   */
  insertSubgraphs(
    items: readonly Subgraph[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert data link rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Links are created after modules, so they reference existing systemIds.
   *
   * @param items - Data links without systemId (will be generated during insertion)
   * @returns Promise resolving to data link insertion result with composite key->systemId mappings
   */
  insertDataLinks(
    items: readonly DataLink[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert control link rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Links are created after modules, so they reference existing systemIds.
   *
   * @param items - Control links without systemId (will be generated during insertion)
   * @returns Promise resolving to control link insertion result with composite key->systemId mappings
   */
  insertControlLinks(
    items: readonly ControlLink[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert use case rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * Process:
   * 1. Inserts KeyVectors (using kvHash as natural key)
   * 2. Inserts UseCases with keyVectorSystemId FK
   * 3. Returns useCaseSystemId for successful insertions
   *
   * Failure handling:
   * - If KeyVector insertion fails, UseCase is marked as failed (not attempted)
   * - If KeyVector succeeds but UseCase fails, UseCase is marked as failed
   * - Only successful UseCases return systemId mappings
   *
   * @param items - UseCases without systemId (will be generated during insertion)
   * @returns Promise resolving to bulk entity insertion result where:
   *   - `idMapping.naturalId` = useCaseSystemId (for successful insertions)
   *   - `idMapping.systemId` = useCaseSystemId (same as naturalId)
   *   - `errors` = Array of InsertError for failed insertions
   *   - `success` = boolean indicating success/failure
   *
   * @example
   * ```typescript
   * const useCases: Omit<UseCase, 'systemId'>[] = [
   *   { fileSystemId: 1, keyVector: { valueSystemIds: [1, 2, 3] }, ... }
   * ];
   * const result = await repository.insertUseCases(useCases);
   *
   * // For successful insertion:
   * const useCaseSystemId = result.results[0].idMapping?.systemId;
   *
   * // For failed insertion:
   * const errors = result.results[0].errors; // InsertError[]
   * const success = result.results[0].success; // false
   * ```
   */
  insertUseCases(
    items: readonly UseCase[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert SPF module definition rows in bulk, including parameters, ports, and intents.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns parameter definition mappings needed for calibration workflows.
   *
   * @param items - SPF module definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to module definition insertion result with definitionId->systemId mappings and parameter mappings
   */
  insertModuleDefinitions(
    items: readonly ModuleDefinition[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert key definition rows in bulk, including value definitions.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns value definition mappings needed for calibration workflows.
   *
   * @param items - Key definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to key definition insertion result with keyId->systemId mappings and value definition mappings
   */
  insertKeyDefinitions(
    items: readonly KeyDefinition[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert processor definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Processor definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with processorId->systemId mappings
   */
  insertProcessorDefinitions(
    items: readonly ProcessorDefinition[],
  ): Promise<BulkInsertResult<BaseInsertError>>;

  /**
   * Insert container type definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Container type definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with containerTypeId->systemId mappings
   */
  insertContainerTypeDefinitions(
    items: readonly ContainerType[],
  ): Promise<BulkInsertResult<BaseInsertError>>;
}
