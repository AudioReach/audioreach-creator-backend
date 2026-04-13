/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Request DTO for creating a usecase category.
 * Contains fields for creating a new usecase category.
 */
export class CreateUsecaseCategoryRequestDto {
  @ApiProperty({
    description:
      'Name of the usecase category. Must be unique among all category names.',
    type: String,
    required: true,
  })
  name!: string;

  @ApiProperty({
    description:
      'Array of usecase system identifiers to associate with this category',
    type: [String],
  })
  usecaseSystemIds!: string[];

  @ApiProperty({
    description:
      'Array of key system identifiers to sort the usecases by. Defines the order in which keys should be used for sorting.',
    type: [String],
    required: false,
  })
  sortKeySystemIds?: string[];
}
