/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ConfigElement} from './config-element.js';
import type {ConfigElementArray} from './config-element-array.js';
import type {Struct} from './struct.js';
import type {StructArray} from './struct-array.js';

/**
 * Union type representing all possible definition element types.
 * Used to replace 'any[]' in parameter and property definitions.
 */
export type DefinitionElement =
  | ConfigElement
  | ConfigElementArray
  | Struct
  | StructArray;
