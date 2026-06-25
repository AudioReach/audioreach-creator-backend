/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TaggedModuleMapChunk} from '../../../shared/acdb-chunks/tagged-module-map-chunk.js';
import type {TaggedModuleDefEntry} from '../../../shared/acdb-chunks/tagged-module-map-chunk.js';
import type {TaggedModuleDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

export interface TaggedModuleMapChunkBuildInput {
  taggedModules: TaggedModuleDownloadModel[];
}

export interface TaggedModuleMapChunkBuildResult {
  chunk: TaggedModuleMapChunk;
}

/**
 * Builds TMLU (TAGGED_MODULES_LUT) and TMDE (TAGGED_MODULES_DEF) chunks.
 *
 * Voice entries (isVoice=true) are excluded.
 *
 * TMLU format:
 *   numEntries: uint32
 *   TaggedModuleEntry[subgraphId ASC, tagId ASC]:
 *     subgraphId:  uint32
 *     tagId:       uint32
 *     tmdeOffset:  uint32  ← byte offset into TMDE raw buffer
 *
 * TMDE format (raw bytes, no size prefix):
 *   TaggedModDEFEntry per TMLU entry (at tmdeOffset):
 *     numPairs: uint32
 *     MidIidPair[moduleId ASC, instanceId ASC]:
 *       mId: uint32
 *       iId: uint32
 */
export const TaggedModuleMapChunkBuilder = {
  buildChunk(
    input: TaggedModuleMapChunkBuildInput,
  ): TaggedModuleMapChunkBuildResult {
    const chunk = new TaggedModuleMapChunk();
    const nonVoice = input.taggedModules.filter(m => !m.isVoice);

    for (const entry of nonVoice) {
      const defEntry: TaggedModuleDefEntry = {
        moduleInstancePairs: entry.moduleInstances.map(m => ({
          moduleId: m.moduleId,
          instanceId: m.instanceId,
        })),
      };
      const tmdeOffset = chunk.addTaggedModuleDefEntry(defEntry);
      chunk.addTaggedModuleEntry(entry.subgraphId, entry.tagId, tmdeOffset);
    }

    return {chunk};
  },
};
