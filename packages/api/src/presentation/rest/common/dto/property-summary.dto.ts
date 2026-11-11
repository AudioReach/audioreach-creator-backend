/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsNotEmpty, IsString} from 'class-validator';
import {createZodDto} from 'nestjs-zod';
import {
  PropertySummaryDtoSchema,
  type ParameterElementSummaryDto,
} from '@arc/core';

export class PropertySummaryDto extends createZodDto(PropertySummaryDtoSchema) {
  @ApiProperty({
    description: 'System identifier of the property to update',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  systemId!: string;

  @ApiProperty({
    description: 'Elements to write',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementSummaryDto'},
        {$ref: '#/components/schemas/ElementTemplateArraySummaryDto'},
        {$ref: '#/components/schemas/StructSummaryDto'},
      ],
    },
  })
  @IsArray()
  elements!: ParameterElementSummaryDto[];
}
