/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspBaseElement} from './base-element.js';

/**
 * Represents an array element with array-specific properties.
 * Extends BaseElement with additional array configuration.
 */
export abstract class AwspBaseArrayElement extends AwspBaseElement {
  /** Array length (required) */
  arrayLength!: number;

  /** Array length formula string (required) */
  arrayLenFormulaStr!: string;

  /** List of copy source information (required) */
  copySrcInfoList!: string[];

  // Extra serializable fields preserved for round-trip fidelity
  arrayDefaultValue?: string;
  userArrayDefaultValue?: string;
  isFunctionalFormula?: boolean;
  groupIndexBasedOn?: string;

  /**
   * Helper method for subclasses to serialize base array element fields
   * @returns Base array element fields as plain object
   */
  protected serializeBaseArrayElementFields(): Record<string, unknown> {
    return {
      ...this.serializeBaseElementFields(),
      arrayLength: this.arrayLength,
      arrayLenFormulaStr: this.arrayLenFormulaStr,
      copySrcInfoList: this.copySrcInfoList,
      arrayDefaultValue: this.arrayDefaultValue,
      userArrayDefaultValue: this.userArrayDefaultValue,
      isFunctionalFormula: this.isFunctionalFormula,
      groupIndexBasedOn: this.groupIndexBasedOn,
    };
  }
}
