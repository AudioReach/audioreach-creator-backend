/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TaggedModuleMapChunk} from '../../../shared/acdb-chunks/tagged-module-map-chunk.js';

export interface TaggedModuleMapSerializationResult {
  tmlu: Uint8Array;
  tmde: Uint8Array;
}

export class TaggedModuleMapChunkSerializer {
  serialize(chunk: TaggedModuleMapChunk): TaggedModuleMapSerializationResult {
    return {
      tmlu: chunk.serializeTmluPayload(),
      tmde: chunk.serializeTmdePayload(),
    };
  }
}
