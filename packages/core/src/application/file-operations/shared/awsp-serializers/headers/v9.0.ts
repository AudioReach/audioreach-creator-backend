/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {AwspFileHeaderBase} from './base.js';

// To add a new version:
//  1. Create headers/vX.Y.ts extending AwspFileHeaderBase with any new fields.
//  2. Add it to the AwspFileHeader union in headers/index.ts and HEADER_PARSERS in upload-file/services/awsp-parser.ts.

export type AwspFileHeaderV90 = AwspFileHeaderBase;

export function parseHeader_V9_0(raw: unknown): AwspFileHeaderV90 {
  // Replace with a Zod schema when stricter validation is needed.
  return raw as AwspFileHeaderV90;
}
