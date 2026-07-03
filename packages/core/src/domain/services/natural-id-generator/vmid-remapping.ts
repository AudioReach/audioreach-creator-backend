/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {NaturalIdType} from './natural-id-type.js';

export interface VmidRemapping {
  type: NaturalIdType;
  oldId: number;
  newId: number;
}
