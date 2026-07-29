/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const MODULE_PORT_STRATEGIES = {
  INPUT_EVEN_OUTPUT_ODD: 'INPUT_EVEN_OUTPUT_ODD',
  SEQUENTIAL: 'SEQUENTIAL',
} as const;

export type ModulePortStrategy =
  (typeof MODULE_PORT_STRATEGIES)[keyof typeof MODULE_PORT_STRATEGIES];
