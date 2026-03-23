/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import type {BaseElement} from '../types/base-element.type.js';
import {ELEMENT_TYPE, type ElementType} from '../types/element-type.js';
import {ConfigElementDto} from './config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from './element-template-array.dto.js';

/**
 * Structure element DTO for calibration data.
 * Represents a named composite type grouping related parameters of mixed types.
 * Structs can be nested and may contain ConfigElements, ElementArrays,
 * and other Structs as child elements.
 *
 * Note: This structure is defined by H2XML.
 */
export class StructDto implements BaseElement {
  // ── Mandatory fields ──────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Discriminator field identifying this as a Struct.',
    default: ELEMENT_TYPE.Struct,
  })
  readonly type: ElementType = ELEMENT_TYPE.Struct;

  @ApiProperty({
    description: 'Unique name of the struct element within its parent scope.',
  })
  name!: string;

  @ApiProperty({
    description:
      'When true, none of the struct elements can be modified by the user.',
  })
  isReadOnly!: boolean;

  @ApiProperty({
    description:
      'Type identifier for the struct, corresponding to the named struct type ' +
      'in the module definition (e.g. "AudioConfig", "FilterSettings").',
  })
  structType!: string;

  @ApiProperty({
    description:
      'Child elements contained within this struct. ' +
      'May be any mix of ConfigElement, ElementTemplateArray, or Struct.',
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
    description: 'Human-readable description of what this struct represents.',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Logical group this struct belongs to for UI organization.',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description:
      'Optional sub-group within the group for finer-grained UI organization.',
    required: false,
  })
  subgroup?: string;
}
