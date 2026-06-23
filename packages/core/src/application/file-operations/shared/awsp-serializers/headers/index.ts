/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type {AwspFileHeaderBase} from './base.js';
/** Discriminated union of all supported AWSP header versions. Add | AwspFileHeaderV91 etc when supported. */
export type {
  AwspFileHeaderV90,
  AwspFileHeaderV90 as AwspFileHeader,
} from './v9.0.js';
