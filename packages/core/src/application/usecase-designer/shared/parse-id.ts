/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {InvalidInputException} from '../../../shared/exceptions/invalid-input.exception.js';

export function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  if (!/^(?:0[xX][\da-fA-F]+|\d+)$/.test(trimmed)) {
    throw new InvalidInputException(
      `${paramName} must be an integer, got: ${value}`,
    );
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num)) {
    throw new InvalidInputException(
      `${paramName} must be a safe integer, got: ${value}`,
    );
  }
  if (num <= 0) {
    throw new InvalidInputException(
      `${paramName} must be positive, got: ${value}`,
    );
  }
  return num;
}
