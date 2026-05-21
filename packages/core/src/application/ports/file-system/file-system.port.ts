/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PathRef} from '../../file-operations/shared/utils/file-ref.js';
import type {JsonValue} from '../../../shared/types/json-types.js';

export interface FileSystemPort {
  /**
   * Read entire content of a file reference and return as Uint8Array.
   * Implementations must be platform-specific adapters (Node, RN),
   * while this interface remains platform-agnostic.
   */
  readAll(ref: PathRef): Promise<Uint8Array>;

  parseBlock(filePath: string, blockName: string): Promise<JsonValue[]>;

  exists(filePath: string): Promise<boolean>;

  joinPath(...paths: string[]): string;

  dirname(filePath: string): string;
  basename(filePath: string, extension: string): string;
  deleteDirectory(dirPath: string): void;

  unzip(zipFilePath: string, outputDir: string): Promise<void>;

  /**
   * Create a ZIP archive from files and return as buffer.
   * @param files - Map of filename to file content (string or Uint8Array)
   * @returns ZIP file as Uint8Array
   */
  zipToBuffer(files: Map<string, string | Uint8Array>): Promise<Uint8Array>;
}
