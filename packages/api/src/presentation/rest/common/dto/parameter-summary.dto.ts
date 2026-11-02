/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsString} from 'class-validator';
import {createZodDto} from 'nestjs-zod';
import {
  ParameterSummaryDtoSchema,
  type ParameterElementSummaryDto,
} from '@arc/core';

export class ParameterSummaryDto extends createZodDto(
  ParameterSummaryDtoSchema,
) {
  // class-validator decorators are required so that the global ValidationPipe
  // (whitelist: true, forbidNonWhitelisted: true) treats these fields as
  // whitelisted. createZodDto alone does not generate class-validator metadata.
  @IsString()
  systemId!: string;

  @IsString()
  name!: string;

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
