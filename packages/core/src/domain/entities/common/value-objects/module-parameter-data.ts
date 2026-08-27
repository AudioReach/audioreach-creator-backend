/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * This class can be used for add or update payload for a param, remove id is enough
 */
import type {SystemId} from './../../../../shared/types/branded-ids.js';
import {BinaryPayloadValue} from './binary-payload-value.js';

export class ModuleParameterData extends BinaryPayloadValue {
  payloadSystemId: number = 0; // Set during ID allocation phase before passing to repository

  constructor(
    readonly paramDefintionSystemId: SystemId,
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
