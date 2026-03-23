/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import type {BaseElement} from '../types/base-element.type.js';
import {ELEMENT_TYPE, type ElementType} from '../types/element-type.js';
import {ConfigElementDto} from './config-element/config-element.dto.js';
import {StructDto} from './struct.dto.js';

/**
 * Configuration element array DTO for calibration data.
 * Represents a homogeneous array of scalar parameters all sharing the same structure.
 * Used for multi-band EQ settings, filter coefficient arrays, per-channel gains, etc.
 * The template field defines the structure of each array item.
 */
export class ElementTemplateArrayDto implements BaseElement {
  // ── Mandatory fields ──────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Discriminator field identifying this as an ElementTemplateArray.',
    default: ELEMENT_TYPE.ElementTemplateArray,
  })
  readonly type: ElementType = ELEMENT_TYPE.ElementTemplateArray;

  @ApiProperty({
    description: 'Unique name of the array element within its parent scope.',
  })
  name!: string;

  @ApiProperty({
    description:
      'When true, none of the array elements can be modified by the user.',
  })
  isReadOnly!: boolean;

  @ApiProperty({
    description:
      'Array of prototype elements defining the structure of each item in the array. ' +
      'Each entry carries the default or definition value as specified in the module definition — ' +
      'not the current calibrated value. ' +
      'May contain a mix of ConfigElement, ElementTemplateArray, and Struct entries.',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ElementTemplateArrayDto'},
        {$ref: '#/components/schemas/StructDto'},
      ],
    },
  })
  template!: (ConfigElementDto | ElementTemplateArrayDto | StructDto)[];

  @ApiProperty({
    description:
      'Ordered list of concrete element instances in the array. ' +
      'Each item follows the structure defined by the template and may be ' +
      'a ConfigElement, ElementTemplateArray, or Struct.',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ElementTemplateArrayDto'},
        {$ref: '#/components/schemas/StructDto'},
      ],
    },
  })
  value!: (ConfigElementDto | ElementTemplateArrayDto | StructDto)[];

  // ── Optional fields ───────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Human-readable description of what this array represents.',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Logical group this array belongs to for UI organization.',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description:
      'Optional sub-group within the group for finer-grained UI organization.',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description:
      'Fixed number of elements in the array. ' +
      'If absent, the length is determined at runtime by lengthFormula.',
    minimum: 0,
    required: false,
  })
  length?: number;

  @ApiProperty({
    description:
      'Expression evaluated at runtime to determine the array length ' +
      'when the length is not statically known (e.g. "num_channels * 2"). ' +
      'Variables in the formula (like num_channels) are linked to other config elements, ',
    required: false,
  })
  lengthFormula?: string;
}
