/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import type {UsecaseDataDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

const TEXT_ENCODER = new TextEncoder();
const ALIAS_SEPARATOR = ' | ';

/**
 * Serializer for the GKV alias chunk (GALS).
 *
 * Binary format (mirrors GkvAliasChunkParser):
 *   GALS body:
 *     NumKeyTables: uint32
 *     GkvAliasTable × NumKeyTables:
 *       NumKeys: uint32
 *       NumGkvs: uint32
 *       GkvEntry × NumGkvs:
 *         numKeys × [keyId uint32, keyVal uint32]
 *         DatapoolOffset: uint32
 *
 *   Datapool payload at each offset:
 *     [uint32 innerStringLength][ASCII bytes: "<aliasId>" or "<aliasId> | <aliasName>"]
 *
 * Usecases are expected to arrive pre-sorted by numKeys → keyIds → valueIds
 * (the order produced by readUsecaseData()).
 *
 * Returns an empty Uint8Array when no entries have aliasId defined.
 */
export class GkvAliasChunkSerializer {
  /**
   * Serialize GKV alias data to binary GALS chunk.
   *
   * @param usecaseData - Download models (must include aliasId/alias fields)
   * @param datapool - Shared datapool for alias string storage
   * @returns Binary GALS chunk body, or empty Uint8Array if no aliases present
   */
  serialize(
    usecaseData: UsecaseDataDownloadModel[],
    datapool: DatapoolChunk,
  ): Uint8Array {
    const withAlias = usecaseData.filter(uc => uc.aliasId !== undefined);
    if (withAlias.length === 0) return new Uint8Array(0);

    const groups = this.groupByNumKeys(withAlias);
    const totalSize = this.calculateTotalSize(groups);
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    BinaryUtils.writeUint32(view, pos, groups.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    for (const group of groups) {
      const numKeys = group[0].keyIds.length;
      BinaryUtils.writeUint32(view, pos, numKeys);
      pos += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, pos, group.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (const uc of group) {
        for (let i = 0; i < uc.keyIds.length; i++) {
          BinaryUtils.writeUint32(view, pos, uc.keyIds[i]);
          pos += BinaryUtils.SIZEOF_UINT32;
          BinaryUtils.writeUint32(view, pos, uc.valueIds[i]);
          pos += BinaryUtils.SIZEOF_UINT32;
        }

        const aliasPayload = this.buildAliasPayload(uc.aliasId!, uc.alias);
        const dpOffset = datapool.addOrReuse(aliasPayload);
        BinaryUtils.writeUint32(view, pos, dpOffset);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  private groupByNumKeys(
    entries: UsecaseDataDownloadModel[],
  ): UsecaseDataDownloadModel[][] {
    const groups: UsecaseDataDownloadModel[][] = [];
    let currentGroup: UsecaseDataDownloadModel[] = [];
    let currentNumKeys = -1;

    for (const entry of entries) {
      const numKeys = entry.keyIds.length;
      if (numKeys !== currentNumKeys) {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        currentNumKeys = numKeys;
      }
      currentGroup.push(entry);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    return groups;
  }

  /**
   * Build the datapool payload for one alias entry.
   *
   * Layout: [uint32 innerStringLength][ASCII bytes]
   * Format: "<aliasId>" or "<aliasId> | <aliasName>"
   *
   * The outer size-prefix added by DatapoolChunk is separate from this payload.
   */
  private buildAliasPayload(aliasId: number, alias?: string): Uint8Array {
    const str =
      alias !== undefined
        ? `${aliasId}${ALIAS_SEPARATOR}${alias}`
        : `${aliasId}`;
    const strBytes = TEXT_ENCODER.encode(str);
    const payload = new Uint8Array(BinaryUtils.SIZEOF_UINT32 + strBytes.length);
    const view = new DataView(payload.buffer);
    BinaryUtils.writeUint32(view, 0, strBytes.length);
    payload.set(strBytes, BinaryUtils.SIZEOF_UINT32);
    return payload;
  }

  private calculateTotalSize(groups: UsecaseDataDownloadModel[][]): number {
    let size = BinaryUtils.SIZEOF_UINT32; // numKeyTables
    for (const group of groups) {
      const numKeys = group[0].keyIds.length;
      size += BinaryUtils.SIZEOF_UINT32; // numKeys
      size += BinaryUtils.SIZEOF_UINT32; // numGkvs
      size += group.length * numKeys * 2 * BinaryUtils.SIZEOF_UINT32; // keyId + keyVal per key
      size += group.length * BinaryUtils.SIZEOF_UINT32; // datapoolOffset
    }
    return size;
  }
}
