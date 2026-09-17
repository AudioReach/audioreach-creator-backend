/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
export interface AddCkvsResult {
  groupId: string;
  addedCkvs: Array<{systemId: number; valueDefinitionSystemIds: number[]}>;
  removedCkvSystemIds: number[];
}
