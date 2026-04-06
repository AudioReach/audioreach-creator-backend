/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  MODULE_PROP_ID_CTRL_HEAP_ID,
  MODULE_PROP_ID_CTRL_LINK_INTENTS,
  HEAP_ID_DEFAULT,
} from '../../constants/spf-ids.js';

/**
 * Extract heapId from control link properties map
 */
export function extractHeapId(properties: Map<number, Uint8Array>): number {
  const heapIdData = properties.get(MODULE_PROP_ID_CTRL_HEAP_ID);

  if (!heapIdData || heapIdData.length < BinaryUtils.SIZEOF_UINT32) {
    return HEAP_ID_DEFAULT; // Default value
  }

  const view = new DataView(
    heapIdData.buffer,
    heapIdData.byteOffset,
    heapIdData.byteLength,
  );
  return BinaryUtils.readUint32(view, 0);
}

/**
 * Extract intents array from control link properties map
 */
export function extractIntents(properties: Map<number, Uint8Array>): number[] {
  const intentsData = properties.get(MODULE_PROP_ID_CTRL_LINK_INTENTS);

  if (!intentsData || intentsData.length === 0) {
    return []; // No intents property found, return empty array
  }

  try {
    const view = new DataView(
      intentsData.buffer,
      intentsData.byteOffset,
      intentsData.byteLength,
    );
    let pos = 0;

    // Read count of intents
    if (intentsData.length < BinaryUtils.SIZEOF_UINT32) {
      throw new Error('Intents data too short to read count');
    }
    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Validate we have enough data for all intents
    const expectedLength =
      BinaryUtils.SIZEOF_UINT32 + count * BinaryUtils.SIZEOF_UINT32;
    if (intentsData.length < expectedLength) {
      throw new Error(
        `Intents data too short: expected ${expectedLength} bytes, got ${intentsData.length}`,
      );
    }

    // Read each intent ID
    const intents: number[] = [];
    for (let i = 0; i < count; i++) {
      const intent = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;
      intents.push(intent);
    }

    return intents;
  } catch {
    // Return empty array on error
    return [];
  }
}
