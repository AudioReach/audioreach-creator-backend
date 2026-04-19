/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * This class can be used for add or update payload for a param, remove id is enough
 */
import {BinaryPayloadValue} from './binary-payload-value.js';

export class ModuleParameterData extends BinaryPayloadValue {
  constructor(
    readonly paramDefintionSystemId: number,
    payload: Uint8Array | null,
  ) {
    super(payload);
  }

  getPayloadCopy(): Uint8Array | null {
    return super.getPayloadCopy();
  }

  setPayloadCopy(src: Uint8Array | null) {
    this.setPayloadCopyInternal(src);
  }
}
