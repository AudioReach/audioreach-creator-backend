/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Discriminator const/type for usecase types. */
export const USECASE_TYPE = {
  Ec: 'EC',
  Regular: 'REGULAR',
  Manual: 'MANUAL',
} as const;

export type UsecaseType = (typeof USECASE_TYPE)[keyof typeof USECASE_TYPE];
