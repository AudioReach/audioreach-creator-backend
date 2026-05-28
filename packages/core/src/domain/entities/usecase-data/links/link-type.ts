/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const LINK_TYPE = {
  IntraSubgraph: 'INTRA_SUBGRAPH',
  IntraUsecase: 'INTRA_USECASE',
  InterUsecase: 'INTER_USECASE',
} as const;

export type LinkType = (typeof LINK_TYPE)[keyof typeof LINK_TYPE];
