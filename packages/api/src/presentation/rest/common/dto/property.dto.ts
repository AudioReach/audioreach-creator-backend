/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';
import {ConfigElementDto} from './element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from './element-data/elements/element-template-array.dto.js';
import {StructDto} from './element-data/elements/struct.dto.js';

export class PropertyDto {
  @ApiProperty({description: 'System ID'})
  readonly systemId!: string;

  @ApiProperty({description: 'Property ID'})
  readonly propertyId!: number;

  @ApiProperty({description: 'Property name'})
  readonly propertyName!: string;

  @ApiProperty({
    description:
      'Array of calibration elements for this property.\n\n' +
      'This array can contain three different types of calibration elements:\n\n' +
      '**1. ConfigElement (Simple Parameters):**\n' +
      '   - Single configuration values (volume, gain, frequency)\n' +
      '   - Rendered as UI controls like sliders, text boxes, dropdowns\n\n' +
      '**2. ElementTemplateArray (Parameter Arrays):**\n' +
      '   - Arrays of configuration values of the same type\n' +
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
  elements?: (ConfigElementDto | ElementTemplateArrayDto | StructDto)[];

  @ApiProperty({description: 'Definition link', required: false})
  definitionLink?: EndPointLink;

  constructor(systemId: string, propertyId: number, propertyName: string) {
    this.systemId = systemId;
    this.propertyId = propertyId;
    this.propertyName = propertyName;
    this.elements = [];

    const link = new EndPointLink();
    link.hypertextRef = `/definition/properties/${this.systemId}`;
    link.method = 'GET';
    link.description = 'Get property definition.';
    this.definitionLink = link;
  }
}
