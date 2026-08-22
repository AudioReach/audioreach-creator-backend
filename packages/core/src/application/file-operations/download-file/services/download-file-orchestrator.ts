/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BulkReadQueryService,
  DownloadEntities,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import {
  PROFILER_OPERATIONS,
  MEMORY_SNAPSHOTS,
} from '../../../../shared/profiling/profiler-types.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
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
 * 1. Reads all entities from DB via BulkReadQueryService
 * 2. Serializes to ACDB and AWSP in parallel (or sequentially for React Native)
 */
export class DownloadFileOrchestrator {
  constructor(
    private readonly bulkReadQueryService: BulkReadQueryService,
    private readonly fileSystem: FileSystemPort,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
    private readonly profiler?: ProfilerPort,
  ) {}

  /**
   * Level-1 file parallelization (SERIALIZE_AWSP_FILE / SERIALIZE_ACDB_FILE)
   * is not yet enabled — those handlers are not registered in NodeRegistry.
   * The workerPool is still used by AcdbFileSerializer for Level-2 chunk parallelism.
   */
  private shouldUseWorkers(): boolean {
    return false;
  }

  /**
   * Serialize files with optional parallel processing.
   * Splits into 2 tasks (AWSP, ACDB) if workers available.
   */
  private async serializeFiles(
    entities: DownloadEntities,
  ): Promise<DownloadResult> {
    if (this.shouldUseWorkers()) {
      return this.serializeFilesParallel(entities);
    }
    return this.serializeFilesSequential(entities);
  }

  /**
   * Serialize files sequentially (fallback for React Native).
   */
  private async serializeFilesSequential(
    entities: DownloadEntities,
  ): Promise<DownloadResult> {
    const acdbSerializer = new AcdbFileSerializer(
      undefined,
      this.logger,
      this.profiler,
    );
    const awspSerializer = new AwspFileSerializer(this.fileSystem, this.logger);

    const acdbBuffer = await acdbSerializer.serialize(entities);
    const awspBuffer = await awspSerializer.serialize(entities);

    return {acdbBuffer, awspBuffer};
  }

  /**
   * Serialize files in parallel using workers.
   */
  private async serializeFilesParallel(
    entities: DownloadEntities,
  ): Promise<DownloadResult> {
    const tasks = [
      {
        handlerKey: HANDLER_KEYS.SERIALIZE_AWSP_FILE,
        input: {entities},
      },
      {
        handlerKey: HANDLER_KEYS.SERIALIZE_ACDB_FILE,
        input: {entities},
      },
    ];

    const results = await this.workerPool!.executeParallel(tasks);

    if (!results[0].success || !results[1].success) {
      throw new Error(
        `Failed to serialize files: ${results[0].error || results[1].error}`,
      );
    }

    return {
      awspBuffer: results[0].data as Uint8Array,
      acdbBuffer: results[1].data as Uint8Array,
    };
  }

  async orchestrate(
    fileSystemId: number,
    _fileNames: {acdb: string; awsp: string},
  ): Promise<DownloadResult> {
    this.profiler?.start(PROFILER_OPERATIONS.FILE_ORCHESTRATION);
    this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PARSING);

    // Step 1: Read all entities from DB
    this.profiler?.start(PROFILER_OPERATIONS.DATABASE_TRANSACTION);
    const entities =
      await this.bulkReadQueryService.readAllEntitiesForFile(fileSystemId);
    const readMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.DATABASE_TRANSACTION,
    );
    if (readMetrics) {
      this.logger?.logInfo({
        msg: 'read_all_entities_completed',
        description: `readAllEntitiesForFile completed in ${readMetrics.duration.toFixed(1)}ms`,
        component: 'DownloadFileOrchestrator',
        tag: 'download-file',
      });
    }

    this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PARSING);

    // Step 2: Serialize to files (parallel or sequential)
    this.profiler?.start(PROFILER_OPERATIONS.CHUNK_PARSING);
    const result = await this.serializeFiles(entities);
    const serializeMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.CHUNK_PARSING,
    );
    if (serializeMetrics) {
      this.logger?.logInfo({
        msg: 'serialize_completed',
        description: `serialize completed in ${serializeMetrics.duration.toFixed(1)}ms`,
        component: 'DownloadFileOrchestrator',
        tag: 'download-file',
      });
    }

    const totalMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.FILE_ORCHESTRATION,
    );
    if (totalMetrics) {
      this.logger?.logInfo({
        msg: 'download_file_total',
        description: `download-file total: ${totalMetrics.duration.toFixed(1)}ms`,
        component: 'DownloadFileOrchestrator',
        tag: 'download-file',
      });
    }

    return result;
  }
}
