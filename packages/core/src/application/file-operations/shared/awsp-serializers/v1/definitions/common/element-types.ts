/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {AwspConfigElement} from './config-element.js';
import type {AwspConfigElementArray} from './config-element-array.js';
import type {AwspStruct} from './struct.js';
import type {AwspStructArray} from './struct-array.js';

/**
 * Union type representing all possible definition element types.
 * Used to replace 'any[]' in parameter and property definitions.
 */
export type AwspDefinitionElement =
  | AwspConfigElement
  | AwspConfigElementArray
  | AwspStruct
  | AwspStructArray;
