/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const MAJOR_MODULE_TYPE = {
  Generic: 'GENERIC',
  Decoder: 'DECODER',
  Encoder: 'ENCODER',
  Converter: 'CONVERTER',
  Packetizer: 'PACKETIZER',
  Depacketizer: 'DEPACKETIZER',
  Detector: 'DETECTOR',
  Generator: 'GENERATOR',
  PP: 'PP',
  EndPoint: 'END_POINT',
} as const;

export type MajorModuleType =
  (typeof MAJOR_MODULE_TYPE)[keyof typeof MAJOR_MODULE_TYPE];
