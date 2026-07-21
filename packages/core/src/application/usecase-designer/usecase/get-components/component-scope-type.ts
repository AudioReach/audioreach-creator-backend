/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const COMPONENT_SCOPE_TYPE = {
  Usecase: 'USECASE',
  Subgraph: 'SUBGRAPH',
} as const;

export type ComponentScopeType =
  (typeof COMPONENT_SCOPE_TYPE)[keyof typeof COMPONENT_SCOPE_TYPE];
