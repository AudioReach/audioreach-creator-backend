/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface UpdateTkvCalDataResult {
  groupId: string;
  /** Parameter-definition system IDs used to filter the GET readback. */
  succeededParamSystemIds: number[];
}
