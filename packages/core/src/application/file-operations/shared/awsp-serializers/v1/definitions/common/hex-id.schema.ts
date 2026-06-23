/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * Zod schema for AWSP hex identifier fields.
 * Accepts a plain number or a hex string literal (e.g. "0x07001015") and
 * coerces the string form to its numeric value so the rest of the pipeline
 * always works with numbers.
 */
export const HexIdSchema = z.preprocess(val => {
  if (typeof val === 'string' && /^0x[0-9a-f]+$/i.test(val)) {
    return Number.parseInt(val, 16);
  }
  return val;
}, z.number().int().nonnegative());

/** Like HexIdSchema but rejects zero — use for definition-level id fields. */
export const PositiveHexIdSchema = z.preprocess(val => {
  if (typeof val === 'string' && /^0x[0-9a-f]+$/i.test(val)) {
    return Number.parseInt(val, 16);
  }
  return val;
}, z.number().int().positive());
