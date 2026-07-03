/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {NaturalIdType} from '../../../domain/services/natural-id-generator/natural-id-type.js';
import type {VmidRemapping} from '../../../domain/services/natural-id-generator/vmid-remapping.js';

export interface NaturalIdGenerationPort {
  registerBatch(
    fileSystemId: number,
    entries: Array<{type: NaturalIdType; id: number}>,
  ): void;

  getNextId(fileSystemId: number, type: NaturalIdType): number;

  release(fileSystemId: number, type: NaturalIdType, id: number): boolean;

  getRange(
    fileSystemId: number,
    type: NaturalIdType,
  ): {min: number; max: number};

  setVmid(
    fileSystemId: number,
    vmid: number,
  ): {success: boolean; remappings: VmidRemapping[]};

  getVmid(fileSystemId: number): number;

  //TODO: how to initialize after server reboots.
}
