/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type FilterValue = number | string | boolean;

export type FilterExpression =
  | {
      readonly type: 'AND';
      readonly left: FilterExpression;
      readonly right: FilterExpression;
    }
  | {
      readonly type: 'OR';
      readonly left: FilterExpression;
      readonly right: FilterExpression;
    }
  | {
      readonly type: 'condition';
      readonly field: string;
      readonly value: FilterValue;
    };
