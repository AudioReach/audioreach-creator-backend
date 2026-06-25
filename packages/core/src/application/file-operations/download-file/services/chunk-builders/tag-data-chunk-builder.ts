/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TagDataChunk} from '../../../shared/acdb-chunks/tag-data-chunk.js';
import type {
  TagLutDataTable,
  TagKeyVectorEntry,
  TagDataDefEntry,
  TagDataDotEntry,
} from '../../../shared/acdb-chunks/tag-data-chunk.js';
import type {TagDataDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {compareNumberArrays} from '../../../../../shared/utilities/array-utils.js';

export interface TagDataChunkBuildInput {
  tagData: TagDataDownloadModel[];
  datapool: DatapoolChunk;
}

export interface TagDataChunkBuildResult {
  chunk: TagDataChunk;
}

type Tkv = TagDataDownloadModel['tkvs'][0];
type Module = Tkv['modules'][0];

/**
 * One (IID, PID, payload) triple flattened across the modules sharing a value
 * vector. The MTDE (iId, pId) array and the MTDO (datapool offset) array are
 * built from this same sorted list so they stay positionally parallel.
 */
type FlatEntry = {
  moduleInstanceId: number;
  parameterId: number;
  payload: Uint8Array;
};

/**
 * Group every tkv of a (subgraphId, tagId) entry by its value vector and merge
 * the modules that share a vector. Returns the groups sorted ascending by
 * value vector (numeric, lexicographic per element).
 */
function consolidateByValueVector(
  tkvs: Tkv[],
): Array<{tagKeyValues: number[]; modules: Module[]}> {
  const groups = new Map<string, {tagKeyValues: number[]; modules: Module[]}>();
  for (const tkv of tkvs) {
    const key = tkv.tagKeyValues.join(',');
    const existing = groups.get(key);
    if (existing) {
      existing.modules.push(...tkv.modules);
    } else {
      groups.set(key, {
        tagKeyValues: tkv.tagKeyValues,
        modules: [...tkv.modules],
      });
    }
  }

  return [...groups.values()].sort((a, b) =>
    compareNumberArrays(a.tagKeyValues, b.tagKeyValues),
  );
}

/**
 * Flatten all (IID, PID, payload) triples across the modules sharing a value
 * vector, sorted by (moduleInstanceId, parameterId).
 */
function flattenSortedEntries(modules: Module[]): FlatEntry[] {
  const entries: FlatEntry[] = [];
  for (const mod of modules) {
    for (const param of mod.parameters) {
      entries.push({
        moduleInstanceId: mod.moduleInstanceId,
        parameterId: param.parameterId,
        payload: param.payload,
      });
    }
  }

  entries.sort((a, b) =>
    a.moduleInstanceId === b.moduleInstanceId
      ? a.parameterId - b.parameterId
      : a.moduleInstanceId - b.moduleInstanceId,
  );

  return entries;
}

function processValueVectorGroup(
  group: {tagKeyValues: number[]; modules: Module[]},
  chunk: TagDataChunk,
  datapool: DatapoolChunk,
): TagKeyVectorEntry {
  const entries = flattenSortedEntries(group.modules);

  const defEntry: TagDataDefEntry = {
    taggedIdEntries: entries.map(e => ({
      moduleInstanceId: e.moduleInstanceId,
      paramId: e.parameterId,
    })),
  };
  const mtdeOffset = chunk.addTagDataDefEntry(defEntry);

  const dotEntry: TagDataDotEntry = {
    taggedDataOffsets: entries.map(e => datapool.addOrReuse(e.payload)),
  };
  const mtdoOffset = chunk.addTagDataDotEntry(dotEntry);

  return {
    tagKeyValues: group.tagKeyValues,
    offsetTagDataDEF: mtdeOffset,
    offsetTagDataDOT: mtdoOffset,
  };
}

/**
 * Builder for tag data chunks from database entities.
 *
 * MTKT: index table — one entry per (subgraphId, tagId), pointing into MTLU
 * MTLU: per-tag LUT — numTagKeyValues, numVectorEntries, then per-TKV vectors
 * MTDE: def table — per-vector (iId, pId) pairs
 * MTDO: dot table — per-vector datapool offsets
 */
export const TagDataChunkBuilder = {
  buildChunk(input: TagDataChunkBuildInput): TagDataChunkBuildResult {
    const chunk = new TagDataChunk();
    const {datapool} = input;

    for (const entry of input.tagData) {
      if (entry.tkvs.length === 0) continue;

      const groups = consolidateByValueVector(entry.tkvs);

      const vectorEntries: TagKeyVectorEntry[] = groups.map(group =>
        processValueVectorGroup(group, chunk, datapool),
      );

      const table: TagLutDataTable = {
        numTagKeyValues: entry.numTagKeyValues,
        numTagKeyVectorEntries: groups.length,
        tagKeyVectorEntries: vectorEntries,
      };
      const mtluOffset = chunk.addTagLutDataTable(table);

      chunk.addTagIndexEntry(entry.subgraphId, entry.tagId, mtluOffset);
    }

    return {chunk};
  },
};
