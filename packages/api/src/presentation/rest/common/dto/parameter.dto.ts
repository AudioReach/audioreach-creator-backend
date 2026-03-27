/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from './base.dto.js';
import {ConfigElementDto} from './element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from './element-data/elements/element-template-array.dto.js';
import {StructDto} from './element-data/elements/struct.dto.js';

/**
 * Summary DTO containing essential parameter identification fields.
 * Used for list views and lightweight parameter representations.
 */
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

/**
 * Base DTO carrying the identity fields common to all parameter-level data.
 * Identifies a specific Parameter ID (PID) within a system and provides
 * human-readable metadata.
 */
export class ParameterDto extends ParameterSummaryDto {
  @ApiProperty({
    description: 'Description of what this Parameter ID represents',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description:
      'When true, this parameter should be hidden from the UI. ' +
      'Hidden parameters are typically used for internal system configuration.',
    required: false,
  })
  isHidden?: boolean;

  @ApiProperty({
    description:
      'When true, this parameter cannot be modified by the user. ' +
      'The UI should render all elements of this parameter in a read-only state.',
    required: false,
  })
  isReadOnly?: boolean;

  @ApiProperty({
    description:
      'Indicates whether this parameter is deprecated. ' +
      'When true, the UI may show a deprecation warning. ' +
      'When false or undefined, the parameter is not deprecated.',
    required: false,
  })
  deprecated?: boolean;

  @ApiProperty({
    description:
      'When true, indicates this parameter is related to neural network processing. ' +
      'Neural network parameters may require special handling or processing in the UI.',
    required: false,
  })
  isNeuralNet?: boolean;

  @ApiProperty({
    description:
      'When true, indicates this parameter processing is offloaded to a separate processor or accelerator. ' +
      'Offloaded parameters may have different performance characteristics or constraints.',
    required: false,
  })
  isOffloaded?: boolean;
}

/**
 * Detail DTO extending base parameter with full calibration elements.
 * Used for detailed parameter views that include all configuration data.
 */
export class ParameterDetailDto extends ParameterDto {
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
  elements!: (ConfigElementDto | ElementTemplateArrayDto | StructDto)[];
}
