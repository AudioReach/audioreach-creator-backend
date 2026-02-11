/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface Request {
  readonly id: string;
  readonly timeStamp: Date;
  readonly clientId: string;
}
