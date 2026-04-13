/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinition,
  ProcessorDefinition,
  ContainerType,
  BulkInsertResult,
  TagDefinitionEntityResult,
} from '@arc/core';

import type {BaseInsertError} from './bulk-import-interface/base-insert-error.interface.js';
import type {KeyDefinitionEntityResult} from './bulk-import-key-definition-interface/key-definition-entity-result.interface.js';
import type {BulkContainerTypeInsertResult} from './bulk-import-container-definition/bulk-container-type-insert-result.js';
import type {TagDefinition} from 'application/file-operations/shared/awsp-serializers/v1/definitions/index.js';
import type {BaseEntityResult} from './bulk-import-interface/base-entity-result.interface.js';

/**
 * Repository interface for bulk import operations using insert+query pattern.
 * All methods accept entities without systemId and return insertion reports with natural key mappings.
 * Success is determined by main table insert success; child failures are informational and do not cause rollback.
 */
export interface BulkImportRepository {
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
  ): Promise<BulkInsertResult<KeyDefinitionEntityResult>>;

  /**
   * Insert processor definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Processor definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with processorId->systemId mappings
   */
  insertProcessorDefinitions(
    items: readonly ProcessorDefinition[],
  ): Promise<BulkInsertResult<BaseEntityResult<BaseInsertError>>>;

  insertTagDefinition(
    items: readonly TagDefinition[],
  ): Promise<BulkInsertResult<TagDefinitionEntityResult>>;

  /**
   * Insert container type definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Container type definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with containerTypeId->systemId mappings
   */
  insertContainerTypeDefinitions(
    items: readonly ContainerType[],
  ): Promise<BulkContainerTypeInsertResult>;
}
