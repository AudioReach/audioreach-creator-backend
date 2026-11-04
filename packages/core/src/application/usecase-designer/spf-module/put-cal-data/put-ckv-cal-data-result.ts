/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface PutCkvCalDataResult {
  groupId: string;
  /** Definition IDs used to retrieve the updated calibration parameters. */
  succeededParamSystemIds: number[];
}
