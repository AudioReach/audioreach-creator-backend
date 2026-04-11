/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const SPECIALTY_KEY = {
  None: 'NONE',
  SampleRate: 'SAMPLE_RATE',
  Volume: 'VOLUME',
} as const;

export type SpecialtyKey = (typeof SPECIALTY_KEY)[keyof typeof SPECIALTY_KEY];
