/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
export interface AddCkvsResult {
  groupId: string;
  addedCkvSystemIds: number[];
  removedZeroCkvSystemId?: number;
}
