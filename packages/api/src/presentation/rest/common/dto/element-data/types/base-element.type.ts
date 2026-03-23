/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ElementType} from './element-type.js';

/**
 * Base properties for all calibration elements
 */
export type BaseElement = {
  type: ElementType;
  name: string;
  isReadOnly: boolean;
  description?: string;
  group?: string;
  subgroup?: string;
};
