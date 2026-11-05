/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubgraphPairDataChunk} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  SPF_APM_MODULE_ID,
  PARAM_ID_MODULE_DATA_LINK,
  PARAM_ID_MODULE_CTRL_LINK,
  MODULE_PROP_ID_CTRL_HEAP_ID,
  MODULE_PROP_ID_CTRL_LINK_INTENTS,
} from '../../../../../domain/entities/definitions/spf-ids.js';
import {HEAP_ID_DEFAULT} from '../../../../../domain/entities/definitions/container/container-property-ids.js';

export interface SubgraphPairDataSerializationResult {
  sclu: Uint8Array;
  scde: Uint8Array;
  scdo: Uint8Array;
}

/**
 * Serializes a SubgraphPairDataChunk to binary SCLU/SCDE/SCDO chunks.
 *
 * Binary layout (mirrors SubgraphPairDataChunkParser):
 *   SCLU: [count:4] [srcSgId:4, dstSgId:4, offsetInSCDE:4, offsetInSCDO:4]+
 *   SCDE: concatenated per-pair [numEntries:4][apmModId:4, paramId:4]+ blocks
 *   SCDO: concatenated per-pair [numEntries:4][dataPoolPos:4]+ blocks
 *
 * SCDE/SCDO only get entries for non-empty link types (data and/or ctrl).
 * Datapool payloads are written via datapool.addOrReuse() for deduplication.
 */
export class SubgraphPairDataChunkSerializer {
  serialize(
    chunk: SubgraphPairDataChunk,
    datapool: DatapoolChunk,
  ): SubgraphPairDataSerializationResult {
    const empty = new Uint8Array(0);
    if (chunk.subgraphPairs.length === 0) {
      return {sclu: empty, scde: empty, scdo: empty};
    }

    const scdeSegments: Uint8Array[] = [];
    const scdoSegments: Uint8Array[] = [];
    let scdeOffset = 0;
    let scdoOffset = 0;
    // Deduplicates SCDE segments by content, mirroring CdftOffsetMap.Add() deduplication.
    const scdeContentMap = new Map<string, number>();

    // Per-pair SCLU entry data: [srcId, dstId, scdeOff, scdoOff]
    const lutEntries: Array<{
      srcSgId: number;
      dstSgId: number;
      scdeOffset: number;
      scdoOffset: number;
    }> = [];

    for (const entry of chunk.subgraphPairs) {
      const defEntries: Array<{apmModId: number; paramId: number}> = [];
      const dotEntries: number[] = [];

      if (entry.dataLinks.length > 0) {
        const payload = this.serializeDataLinksPayload(entry.dataLinks);
        const datapoolPos = datapool.addOrReuse(payload);
        defEntries.push({
          apmModId: SPF_APM_MODULE_ID,
          paramId: PARAM_ID_MODULE_DATA_LINK,
        });
        dotEntries.push(datapoolPos);
      }

      if (entry.controlLinks.length > 0) {
        const payload = this.serializeControlLinksPayload(entry.controlLinks);
        const datapoolPos = datapool.addOrReuse(payload);
        defEntries.push({
          apmModId: SPF_APM_MODULE_ID,
          paramId: PARAM_ID_MODULE_CTRL_LINK,
        });
        dotEntries.push(datapoolPos);
      }

      const scdeSeg = this.buildScdeSegment(defEntries);
      const scdeKey = this.hexOf(scdeSeg);
      const existingScdeOffset = scdeContentMap.get(scdeKey);
      let pairScdeOffset: number;
      if (existingScdeOffset !== undefined) {
        pairScdeOffset = existingScdeOffset;
      } else {
        pairScdeOffset = scdeOffset;
        scdeContentMap.set(scdeKey, scdeOffset);
        scdeSegments.push(scdeSeg);
        scdeOffset += scdeSeg.length;
      }

      const scdoSeg = this.buildScdoSegment(dotEntries);

      lutEntries.push({
        srcSgId: entry.sourceSubgraphId,
        dstSgId: entry.destinationSubgraphId,
        scdeOffset: pairScdeOffset,
        scdoOffset,
      });

      scdoSegments.push(scdoSeg);
      scdoOffset += scdoSeg.length;
    }

    const sclu = this.buildSclu(lutEntries);
    const scde = this.mergeBuffers(scdeSegments);
    const scdo = this.mergeBuffers(scdoSegments);

    return {sclu, scde, scdo};
  }

  private serializeDataLinksPayload(
    dataLinks: SubgraphPairDataChunk['subgraphPairs'][0]['dataLinks'],
  ): Uint8Array {
    // [count:4][srcMid:4, srcPortId:4, dstMid:4, dstPortId:4]+
    const size =
      BinaryUtils.SIZEOF_UINT32 +
      dataLinks.length * 4 * BinaryUtils.SIZEOF_UINT32;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, dataLinks.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const dl of dataLinks) {
      BinaryUtils.writeUint32(view, pos, dl.sourceInstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, dl.sourcePortId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, dl.destinationInstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, dl.destinationPortId);
      pos += BinaryUtils.SIZEOF_UINT32;
    }

    return buf;
  }

  private serializeControlLinksPayload(
    controlLinks: SubgraphPairDataChunk['subgraphPairs'][0]['controlLinks'],
  ): Uint8Array {
    // Build each link's serialized bytes first to know total size
    const linkBuffers: Uint8Array[] = [];
    for (const cl of controlLinks) {
      linkBuffers.push(this.serializeSingleControlLink(cl));
    }

    const totalLinksSize = linkBuffers.reduce((s, b) => s + b.length, 0);
    const size = BinaryUtils.SIZEOF_UINT32 + totalLinksSize;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, controlLinks.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const lb of linkBuffers) {
      buf.set(lb, pos);
      pos += lb.length;
    }

    return buf;
  }

  private serializeSingleControlLink(
    cl: SubgraphPairDataChunk['subgraphPairs'][0]['controlLinks'][0],
  ): Uint8Array {
    // Build properties
    const propBufs: Uint8Array[] = [];

    const heapId = cl.heapId ?? HEAP_ID_DEFAULT;
    if (heapId !== HEAP_ID_DEFAULT) {
      propBufs.push(
        this.buildProperty(MODULE_PROP_ID_CTRL_HEAP_ID, 4, v => {
          BinaryUtils.writeUint32(v, 0, heapId);
        }),
      );
    }

    if (cl.intents.length > 0) {
      const intentsSize = (1 + cl.intents.length) * BinaryUtils.SIZEOF_UINT32;
      propBufs.push(
        this.buildProperty(MODULE_PROP_ID_CTRL_LINK_INTENTS, intentsSize, v => {
          BinaryUtils.writeUint32(v, 0, cl.intents.length);
          for (let i = 0; i < cl.intents.length; i++) {
            BinaryUtils.writeUint32(
              v,
              (i + 1) * BinaryUtils.SIZEOF_UINT32,
              cl.intents[i],
            );
          }
        }),
      );
    }

    const propsSize = propBufs.reduce((s, b) => s + b.length, 0);
    // [peer1Mid:4, peer1PortId:4, peer2Mid:4, peer2PortId:4, numProps:4, ...props]
    const size = 5 * BinaryUtils.SIZEOF_UINT32 + propsSize;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, cl.peer1InstanceId);
    pos += BinaryUtils.SIZEOF_UINT32;
    BinaryUtils.writeUint32(view, pos, cl.peer1PortId);
    pos += BinaryUtils.SIZEOF_UINT32;
    BinaryUtils.writeUint32(view, pos, cl.peer2InstanceId);
    pos += BinaryUtils.SIZEOF_UINT32;
    BinaryUtils.writeUint32(view, pos, cl.peer2PortId);
    pos += BinaryUtils.SIZEOF_UINT32;
    BinaryUtils.writeUint32(view, pos, propBufs.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const pb of propBufs) {
      buf.set(pb, pos);
      pos += pb.length;
    }

    return buf;
  }

  /** Build a TLV property buffer: [propId:4][propSize:4][propData:N] */
  private buildProperty(
    propId: number,
    dataSize: number,
    writeData: (view: DataView) => void,
  ): Uint8Array {
    const buf = new Uint8Array(2 * BinaryUtils.SIZEOF_UINT32 + dataSize);
    const view = new DataView(buf.buffer);
    BinaryUtils.writeUint32(view, 0, propId);
    BinaryUtils.writeUint32(view, BinaryUtils.SIZEOF_UINT32, dataSize);
    const dataView = new DataView(buf.buffer, 2 * BinaryUtils.SIZEOF_UINT32);
    writeData(dataView);
    return buf;
  }

  /** Build one SCDE segment: [numEntries:4][apmModId:4, paramId:4]+ */
  private buildScdeSegment(
    entries: Array<{apmModId: number; paramId: number}>,
  ): Uint8Array {
    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entries.length * 2 * BinaryUtils.SIZEOF_UINT32;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, entries.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const e of entries) {
      BinaryUtils.writeUint32(view, pos, e.apmModId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, e.paramId);
      pos += BinaryUtils.SIZEOF_UINT32;
    }

    return buf;
  }

  /** Build one SCDO segment: [numEntries:4][dataPoolPos:4]+ */
  private buildScdoSegment(entries: number[]): Uint8Array {
    const size =
      BinaryUtils.SIZEOF_UINT32 + entries.length * BinaryUtils.SIZEOF_UINT32;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, entries.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const offset of entries) {
      BinaryUtils.writeUint32(view, pos, offset);
      pos += BinaryUtils.SIZEOF_UINT32;
    }

    return buf;
  }

  /** Build SCLU: [count:4][srcSgId:4, dstSgId:4, scdeOffset:4, scdoOffset:4]+ */
  private buildSclu(
    lutEntries: Array<{
      srcSgId: number;
      dstSgId: number;
      scdeOffset: number;
      scdoOffset: number;
    }>,
  ): Uint8Array {
    const size =
      BinaryUtils.SIZEOF_UINT32 +
      lutEntries.length * 4 * BinaryUtils.SIZEOF_UINT32;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, lutEntries.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const e of lutEntries) {
      BinaryUtils.writeUint32(view, pos, e.srcSgId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, e.dstSgId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, e.scdeOffset);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, e.scdoOffset);
      pos += BinaryUtils.SIZEOF_UINT32;
    }

    return buf;
  }

  private hexOf(buf: Uint8Array): string {
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  }

  private mergeBuffers(buffers: Uint8Array[]): Uint8Array {
    const total = buffers.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const b of buffers) {
      out.set(b, pos);
      pos += b.length;
    }
    return out;
  }
}
