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
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import type {AwspFileHeader} from '../../shared/awsp-serializers/headers/index.js';
import type {WorkspaceFileVersion} from '../../shared/awsp-serializers/version.js';

const AWSP_MAGIC = 'AWSP';

/**
 * Serializes domain entities to AWSP format.
 *
 * AWSP file binary layout:
 *   [4]  Magic "AWSP"
 *   [4]  Header length (uint32 little-endian)
 *   [N]  Header JSON (UTF-8)
 *   [4]  Raw data length (uint32 little-endian)
 *   [M]  ZIP archive containing:
 *          definitions.json, configuration.json, persistence.json, fileinfo.json
 */
export class AwspFileSerializer {
  constructor(private readonly fileSystem: FileSystemPort) {}

  /**
   * Serialize entities to AWSP file format.
   *
   * @param _entities - Domain entities from database (unused in empty file implementation)
   * @param options - Optional metadata written into the binary header
   * @returns AWSP file as Uint8Array
   * @throws Error if ZIP creation or binary wrapping fails
   */
  async serialize(
    _entities: DownloadEntities,
    options?: {
      acdbFilePath?: string;
      eacFilePath?: string;
      version?: WorkspaceFileVersion;
    },
  ): Promise<Uint8Array> {
    try {
      // Create empty JSON files
      // TODO: Phase 2 - Add actual data serialization
      const files = new Map<string, string>([
        [FILE_NAMES.DEFINITIONS_JSON, '{}'],
        [FILE_NAMES.CONFIGURATION_JSON, '{}'],
        [FILE_NAMES.PERSISTENCE_JSON, '{}'],
        [FILE_NAMES.FILEINFO_JSON, '{}'],
      ]);

      const zipBuffer = await this.fileSystem.zipToBuffer(files);

      const header: AwspFileHeader = {
        version: options?.version ?? {major: 1, minor: 0},
        acdbFilePath: options?.acdbFilePath ?? '',
        eacFilePath: options?.eacFilePath ?? '',
        workspaceFileInfo: {type: 'JSON', isZipped: true, isEncrypted: false},
      };

      return this.buildBinaryEnvelope(zipBuffer, header);
    } catch (error) {
      throw new Error(
        `Failed to serialize ${FILE_EXTENSIONS.AWSP} file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Wrap a ZIP buffer with the AWSP binary envelope:
   *   MAGIC(4) + headerLength(4) + headerBytes(N) + rawLength(4) + zipBytes(M)
   */
  private buildBinaryEnvelope(
    zipData: Uint8Array,
    header: AwspFileHeader,
  ): Uint8Array {
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));

    const totalSize =
      BinaryUtils.SIZEOF_UINT32 + // magic
      BinaryUtils.SIZEOF_UINT32 + // header length
      headerBytes.byteLength +
      BinaryUtils.SIZEOF_UINT32 + // raw data length
      zipData.byteLength;

    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;

    result.set(new TextEncoder().encode(AWSP_MAGIC), offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, headerBytes.byteLength);
    offset += BinaryUtils.SIZEOF_UINT32;

    result.set(headerBytes, offset);
    offset += headerBytes.byteLength;

    BinaryUtils.writeUint32(view, offset, zipData.byteLength);
    offset += BinaryUtils.SIZEOF_UINT32;

    result.set(zipData, offset);

    return result;
  }
}
