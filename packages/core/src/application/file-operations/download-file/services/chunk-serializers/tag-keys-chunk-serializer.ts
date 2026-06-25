/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TagKeysChunk} from '../../../shared/acdb-chunks/tag-keys-chunk.js';

export class TagKeysChunkSerializer {
  serialize(chunk: TagKeysChunk): Uint8Array {
    return chunk.serializeMtklPayload();
  }
}
