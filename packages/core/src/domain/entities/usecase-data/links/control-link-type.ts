/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const CONTROL_LINK_TYPE = {
  Normal: 'NORMAL',
  InterUsecase: 'INTER_USECASE',
} as const;

export type ControlLinkType =
  (typeof CONTROL_LINK_TYPE)[keyof typeof CONTROL_LINK_TYPE];
