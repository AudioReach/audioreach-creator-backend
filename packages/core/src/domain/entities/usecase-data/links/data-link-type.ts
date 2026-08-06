/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const DATA_LINK_TYPE = {
  Normal: 'NORMAL',
  InterUsecase: 'INTER_USECASE',
  Ec: 'EC',
} as const;

export type DataLinkType = (typeof DATA_LINK_TYPE)[keyof typeof DATA_LINK_TYPE];
