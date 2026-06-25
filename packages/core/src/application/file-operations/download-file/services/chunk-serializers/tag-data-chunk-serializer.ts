/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {TagDataChunk} from '../../../shared/acdb-chunks/tag-data-chunk.js';

export interface TagDataSerializationResult {
  mtkt: Uint8Array;
  mtlu: Uint8Array;
  mtde: Uint8Array;
  mtdo: Uint8Array;
}

export class TagDataChunkSerializer {
  serialize(chunk: TagDataChunk): TagDataSerializationResult {
    return {
      mtkt: this.serializeMtkt(chunk),
      mtlu: this.serializeMtlu(chunk),
      mtde: this.serializeMtde(chunk),
      mtdo: this.serializeMtdo(chunk),
    };
  }

  private serializeMtkt(chunk: TagDataChunk): Uint8Array {
    const numEntries = chunk.tagIndexEntries.length;
    const bytes = new Uint8Array(
      BinaryUtils.SIZEOF_UINT32 + numEntries * 3 * BinaryUtils.SIZEOF_UINT32,
    );
    const view = new DataView(bytes.buffer);
    BinaryUtils.writeUint32(view, 0, numEntries);
    let pos = BinaryUtils.SIZEOF_UINT32;
    for (const entry of chunk.tagIndexEntries) {
      BinaryUtils.writeUint32(view, pos, entry.subgraphId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, entry.tagId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, entry.offsetTagDataTable);
      pos += BinaryUtils.SIZEOF_UINT32;
    }
    return bytes;
  }

  private serializeMtlu(chunk: TagDataChunk): Uint8Array {
    const parts = chunk.getTagLutEntries().map(({table}) => {
      const vectorSize =
        (table.numTagKeyValues + 2) * BinaryUtils.SIZEOF_UINT32;
      const bytes = new Uint8Array(
        2 * BinaryUtils.SIZEOF_UINT32 +
          table.numTagKeyVectorEntries * vectorSize,
      );
      const view = new DataView(bytes.buffer);
      BinaryUtils.writeUint32(view, 0, table.numTagKeyValues);
      BinaryUtils.writeUint32(
        view,
        BinaryUtils.SIZEOF_UINT32,
        table.numTagKeyVectorEntries,
      );
      let pos = 2 * BinaryUtils.SIZEOF_UINT32;
      for (const ve of table.tagKeyVectorEntries) {
        for (const val of ve.tagKeyValues) {
          BinaryUtils.writeUint32(view, pos, val);
          pos += BinaryUtils.SIZEOF_UINT32;
        }
        BinaryUtils.writeUint32(view, pos, ve.offsetTagDataDEF);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, ve.offsetTagDataDOT);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return bytes;
    });
    return parts.length > 0
      ? BinaryUtils.concatenate(parts)
      : new Uint8Array(0);
  }

  private serializeMtde(chunk: TagDataChunk): Uint8Array {
    const parts = chunk.getTagDefEntries().map(({entry}) => {
      const bytes = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.taggedIdEntries.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(bytes.buffer);
      BinaryUtils.writeUint32(view, 0, entry.taggedIdEntries.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const e of entry.taggedIdEntries) {
        BinaryUtils.writeUint32(view, pos, e.moduleInstanceId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, e.paramId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return bytes;
    });
    return parts.length > 0
      ? BinaryUtils.concatenate(parts)
      : new Uint8Array(0);
  }

  private serializeMtdo(chunk: TagDataChunk): Uint8Array {
    const parts = chunk.getTagDotEntries().map(({entry}) => {
      const bytes = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.taggedDataOffsets.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(bytes.buffer);
      BinaryUtils.writeUint32(view, 0, entry.taggedDataOffsets.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const o of entry.taggedDataOffsets) {
        BinaryUtils.writeUint32(view, pos, o);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return bytes;
    });
    return parts.length > 0
      ? BinaryUtils.concatenate(parts)
      : new Uint8Array(0);
  }
}
