/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Serializes domain entities to AWSP JSON format.
 *
 * Reuses AWSP serializer classes from shared/awsp-serializers/v1/.
 * Uses class-transformer instanceToPlain() for serialization.
 * Implementation deferred — see Phase 3 of the download-file plan.
 */
export class AwspFileSerializer {
  /**
   * @throws {Error} Not yet implemented — Phase 3
   */
  serialize(_entities: DownloadEntities): Promise<Uint8Array> {
    throw new Error(
      'AwspFileSerializer.serialize() is not yet implemented. See Phase 3 of the download-file plan.',
    );
  }
}
