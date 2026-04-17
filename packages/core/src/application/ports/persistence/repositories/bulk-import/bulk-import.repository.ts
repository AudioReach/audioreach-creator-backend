/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SpfModule,
  Container,
  DataLink,
  ControlLink,
  KeyDefinition,
  ProcessorDefinition,
  Subgraph,
  ContainerType,
  UseCase,
  ModuleDefinition,
  BulkInsertResult,
} from '@arc/core';

/**
 * Repository interface for bulk import operations. Failure of any insertion results in upload-file failure.
 */
export interface BulkImportRepository {
  /**
   * Inserts SPF module instances in bulk, including CKV, TKV, and related entities.
   *
   * @param items - SPF modules with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertSpfModules(items: SpfModule[]): Promise<BulkInsertResult>;

  /**
   * Inserts container rows in bulk.
   *
   * @param items - Containers with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertContainers(items: readonly Container[]): Promise<BulkInsertResult>;

  /**
   * Inserts subgraph rows in bulk.
   *
   * @param items - Subgraphs with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertSubgraphs(items: readonly Subgraph[]): Promise<BulkInsertResult>;

  /**
   * Inserts data link rows in bulk.
   * Links are inserted after modules so that referenced systemIds already exist.
   *
   * @param items - Data links with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertDataLinks(items: readonly DataLink[]): Promise<BulkInsertResult>;

  /**
   * Inserts control link rows in bulk.
   * Links are inserted after modules so that referenced systemIds already exist.
   *
   * @param items - Control links with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertControlLinks(items: readonly ControlLink[]): Promise<BulkInsertResult>;

  /**
   * Inserts use case rows in bulk, including their associated KeyVectors.
   *
   * @param items - UseCases with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertUseCases(items: readonly UseCase[]): Promise<BulkInsertResult>;

  /**
   * Inserts SPF module definition rows in bulk, including parameters, ports, and intents.
   *
   * @param items - SPF module definitions with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertModuleDefinitions(
    items: readonly ModuleDefinition[],
  ): Promise<BulkInsertResult>;

  /**
   * Inserts key definition rows in bulk, including value definitions.
   *
   * @param items - Key definitions with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertKeyDefinitions(
    items: readonly KeyDefinition[],
  ): Promise<BulkInsertResult>;

  /**
   * Inserts processor definition rows in bulk.
   *
   * @param items - Processor definitions with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertProcessorDefinitions(
    items: readonly ProcessorDefinition[],
  ): Promise<BulkInsertResult>;

  /**
   * Inserts container type definition rows in bulk.
   *
   * @param items - Container type definitions with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertContainerTypeDefinitions(
    items: readonly ContainerType[],
  ): Promise<BulkInsertResult>;
}
