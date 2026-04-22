/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Type} from 'class-transformer';
import {AwspBaseArrayElement} from './base-array-element.js';
import {AwspStruct} from './struct.js';

/**
 * Represents a structure array element.
 * Extends ArrayElement with structure-specific properties.
 */
export class AwspStructArray extends AwspBaseArrayElement {
  /** Key structure definition (required) */
  @Type(() => AwspStruct)
  keyStructureDefinition!: AwspStruct;
}
