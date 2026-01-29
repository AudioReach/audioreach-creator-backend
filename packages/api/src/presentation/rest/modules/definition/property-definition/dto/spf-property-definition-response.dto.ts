/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class SpfPropertyDto {
  @ApiProperty({description: 'Property ID'})
  id!: string;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Maximum size in bytes'})
  maxSize!: string;

  @ApiProperty({description: 'Voice property flag', required: false})
  isVoice?: boolean;

  @ApiProperty({description: 'Property description'})
  description!: string;
}

/**
 * DTO representing SPF Property Definition
 */
export class SpfPropertyDefinitionResponseDto {
  @ApiProperty({description: 'Property category ID'})
  propCategoryID!: string;

  @ApiProperty({description: 'Property category name'})
  propCategoryName!: string;

  @ApiProperty({
    type: [SpfPropertyDto],
    description: 'List of properties in this category',
  })
  properties!: SpfPropertyDto[];
}
