/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {
  ParameterSummaryDtoSchema,
  type ParameterElementSummaryDto,
} from '@arc/core';

export class ParameterSummaryDto extends createZodDto(
  ParameterSummaryDtoSchema,
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
  elements!: ParameterElementSummaryDto[];
}
