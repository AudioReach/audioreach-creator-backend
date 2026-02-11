/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseElement} from './base-element.js';

/**
 * Represents an array element with array-specific properties.
 * Extends BaseElement with additional array configuration.
 */
export abstract class BaseArrayElement extends BaseElement {
  /** Array length (required) */
  arrayLength!: number;

  /** Array length formula string (required) */
  arrayLenFormulaStr!: string;

  /** List of copy source information (required) */
  copySrcInfoList!: string[];
}
