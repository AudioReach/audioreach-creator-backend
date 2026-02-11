/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export class SameNodeException extends Error {
  constructor(nodeId: number) {
    super(`Link cannot be connected to same node : ${nodeId}`);
  }
}
