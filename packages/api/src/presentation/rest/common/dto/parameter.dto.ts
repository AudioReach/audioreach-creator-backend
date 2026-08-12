/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {BaseDto} from './base.dto.js';
import {ParameterDtoSchema, type ParameterElementDto} from '@arc/core';

export class ParameterSummaryDto extends BaseDto {
  @ApiProperty({
    description: 'Unique identifier for the system containing this parameter',
  })
  systemId!: string;

  @ApiProperty({
    description: 'parameterId',
  })
  parameterId!: string;

  @ApiProperty({
    description: 'Human-readable display name for the parameter',
  })
  name!: string;
}

export class ParameterDto extends createZodDto(ParameterDtoSchema) {
  @ApiProperty({
    description:
      'Array of calibration elements for this Parameter ID.\n\n' +
      'This array can contain three different types of calibration elements:\n\n' +
      '**1. ConfigElement (Simple Parameters):**\n' +
      '   - Single configuration values (volume, gain, frequency)\n' +
      '   - Rendered as UI controls like sliders, text boxes, dropdowns\n\n' +
      '**2. ElementTemplateArray (Parameter Arrays):**\n' +
      '   - Arrays of configuration values of the same type\n' +
      '   - Used for multi-band EQs, filter coefficients, channel gains\n' +
      '   - Contains template defining the structure of each array item\n\n' +
      '**3. Struct (Grouped Parameters):**\n' +
      '   - Complex structured data grouping related parameters\n' +
      '   - Contains nested elements of any calibration type',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ElementTemplateArrayDto'},
        {$ref: '#/components/schemas/StructDto'},
      ],
    },
  })
  elements!: ParameterElementDto[];
}
