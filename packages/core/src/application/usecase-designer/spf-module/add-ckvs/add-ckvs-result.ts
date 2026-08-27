/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CkvDto} from '../query/spf-module-dto.js';

export interface AddCkvsResult {
  groupId: string;
  addedCkvs: CkvDto[];
  removedCkvSystemIds: number[];
}
