/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BulkReadRepository} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import {AcdbFileSerializer} from './acdb-file-serializer.js';
import {AwspFileSerializer} from './awsp-file-serializer.js';

export interface DownloadOptions {
  /** When true, serialize ACDB and AWSP sequentially. Default: false (parallel). */
  sequential?: boolean;
}

export interface DownloadResult {
  acdbBuffer: Uint8Array;
  awspBuffer: Uint8Array;
}

/**
 * Orchestrates the download-file workflow:
 * 1. Reads all entities from DB via BulkReadRepository
 * 2. Serializes to ACDB and AWSP in parallel (or sequentially for React Native)
 */
export class DownloadFileOrchestrator {
  constructor(
    private readonly bulkReadRepository: BulkReadRepository,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async orchestrate(
    fileSystemId: number,
    _fileNames: {acdb: string; awsp: string},
  ): Promise<DownloadResult> {
    // Step 1: Read all entities from DB
    const entities =
      await this.bulkReadRepository.readAllEntitiesForFile(fileSystemId);

    // Step 2: Serialize to files
    const acdbSerializer = new AcdbFileSerializer();
    const awspSerializer = new AwspFileSerializer(this.fileSystem);

    // ACDB serialization is synchronous (HeaderChunk only for now)
    const acdbBuffer = acdbSerializer.serialize(entities);

    // AWSP serialization is async
    const awspBuffer = await awspSerializer.serialize(entities);

    return {acdbBuffer, awspBuffer};
  }
}
