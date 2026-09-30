/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Summary returned after persistence applies and cleans the staged actions. */
export type ApplyChangesSummary = {
  commitId: number;
  appliedEntityCount: number;
  appliedAggregateCount: number;
};
