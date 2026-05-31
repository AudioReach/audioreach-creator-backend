/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import {AcdbFileSerializer} from '../services/acdb-file-serializer.js';
import {AwspFileSerializer} from '../services/awsp-file-serializer.js';
import type {DownloadEntities} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

/**
 * Input for file serialization handlers.
 */
export interface FileSerializerInput {
  entities: DownloadEntities;
}

/**
 * Registry of file serialization handlers for Level 1 parallelization.
 * These handlers run in separate workers to serialize AWSP and ACDB files concurrently.
 *
 * Usage:
 * ```typescript
 * const registry = createFileSerializerRegistry(fileSystem, workerPool);
 * const handler = registry[HANDLER_KEYS.SERIALIZE_ACDB_FILE];
 * const result = await handler(input);
 * ```
 */
export function createFileSerializerRegistry(
  fileSystem: FileSystemPort,
  workerPool?: WorkerPoolPort,
): Record<string, Handler<FileSerializerInput, unknown, Uint8Array>> {
  return {
    [HANDLER_KEYS.SERIALIZE_AWSP_FILE]: async (input: FileSerializerInput) => {
      const serializer = new AwspFileSerializer(fileSystem);
      return await serializer.serialize(input.entities);
    },

    [HANDLER_KEYS.SERIALIZE_ACDB_FILE]: async (input: FileSerializerInput) => {
      const serializer = new AcdbFileSerializer(workerPool);
      return await serializer.serialize(input.entities);
    },
  };
}
