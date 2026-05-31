/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import {
  FILE_NAMES,
  FILE_EXTENSIONS,
} from '../../shared/constants/definition-block-names.js';

/**
 * Serializes domain entities to AWSP format (ZIP file containing JSON files).
 *
 * AWSP file structure:
 * - definitions.json: Contains definition blocks (keyDefinitions, spfModuleDefinitions, etc.)
 * - configuration.json: Contains configuration data
 * - persistence.json: Contains persistence metadata
 * - fileinfo.json: Contains file information metadata
 *
 * Current implementation creates empty JSON files as placeholders.
 * Data serialization will be added in future phases.
 */
export class AwspFileSerializer {
  constructor(private readonly fileSystem: FileSystemPort) {}

  /**
   * Serialize entities to AWSP file (ZIP format with empty JSON files).
   *
   * @param _entities - Domain entities from database (unused in empty file implementation)
   * @returns AWSP file as Uint8Array
   * @throws Error if ZIP creation fails
   */
  async serialize(_entities: DownloadEntities): Promise<Uint8Array> {
    try {
      // Create empty JSON files
      // TODO: Phase 2 - Add actual data serialization
      const files = new Map<string, string>([
        [FILE_NAMES.DEFINITIONS_JSON, '{}'],
        [FILE_NAMES.CONFIGURATION_JSON, '{}'],
        [FILE_NAMES.PERSISTENCE_JSON, '{}'],
        [FILE_NAMES.FILEINFO_JSON, '{}'],
      ]);

      // Create ZIP archive
      const zipBuffer = await this.fileSystem.zipToBuffer(files);

      return zipBuffer;
    } catch (error) {
      throw new Error(
        `Failed to serialize ${FILE_EXTENSIONS.AWSP} file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
