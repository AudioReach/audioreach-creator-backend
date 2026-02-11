/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';
import {BaseValueElement} from './pid-data.dto.js';

export class PropertyDto {
  @ApiProperty({description: 'System ID'})
  readonly systemId!: string;

  @ApiProperty({description: 'Property ID'})
  readonly propertyId!: number;

  @ApiProperty({description: 'Property name'})
  readonly propertyName!: string;

  @ApiProperty({description: 'Has definition or not'})
  readonly hasDefinition!: boolean;

  @ApiProperty({
    description: 'Property values',
    type: [BaseValueElement],
  })
  propertyValues?: BaseValueElement[];

  @ApiProperty({description: 'Definition link', required: false})
  definitionLink?: EndPointLink;

  constructor(
    systemId: string,
    propertyId: number,
    propertyName: string,
    hasDefinition: boolean = false,
  ) {
    this.systemId = systemId;
    this.propertyId = propertyId;
    this.propertyName = propertyName;
    this.hasDefinition = hasDefinition;
    this.propertyValues = [];

    // Only create definition link for property types that have definitions
    if (hasDefinition) {
      const link = new EndPointLink();
      link.hypertextRef = `/definition/properties/${hasDefinition}/${this.systemId}`;
      link.method = 'GET';
      link.description = 'Get property definition.';
      this.definitionLink = link;
    }
  }
}
