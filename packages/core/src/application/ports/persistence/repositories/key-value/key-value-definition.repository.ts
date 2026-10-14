/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface KeyValueSummary {
  keyId: number;
  valueId: number;
}

export interface KeyValueDefinitionRepository {
  getSummariesForValues(
    fileSystemId: number,
    sessionId: number,
    valueSystemIds: readonly number[],
  ): Promise<KeyValueSummary[]>;
}
