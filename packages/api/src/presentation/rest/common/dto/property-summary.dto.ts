/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray} from 'class-validator';
import {createZodDto} from 'nestjs-zod';
import {
  UpdatePropertyRequestDtoSchema,
  type ParameterElementSummaryDto,
} from '@arc/core';

export class PropertySummaryDto extends createZodDto(
  UpdatePropertyRequestDtoSchema,
) {
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
