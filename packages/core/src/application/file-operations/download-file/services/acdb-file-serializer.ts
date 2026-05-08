/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Serializes domain entities to binary ACDB format.
 *
 * Reuses ACDB chunk classes from shared/acdb-chunks/.
 * Implementation deferred — see Phase 2 of the download-file plan.
 */
export class AcdbFileSerializer {
  /**
   * @throws {Error} Not yet implemented — Phase 2
   */
  serialize(_entities: DownloadEntities): Promise<Uint8Array> {
    throw new Error(
      'AcdbFileSerializer.serialize() is not yet implemented. See Phase 2 of the download-file plan.',
    );
  }
}
