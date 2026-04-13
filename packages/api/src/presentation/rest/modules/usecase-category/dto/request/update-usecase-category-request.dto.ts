/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Request DTO for updating a usecase category.
 * Contains fields for updating an existing usecase category.
 */
export class UpdateUsecaseCategoryRequestDto {
  @ApiProperty({
    description:
      'Updated name of the usecase category. Must be unique among all category names.',
    type: String,
    required: false,
  })
  name?: string;

  @ApiProperty({
    description:
      'Array of usecase system identifiers to associate with this category. If not provided, existing usecase associations are kept unchanged. If provided, replaces all existing associations.',
    type: [String],
    required: false,
  })
  usecaseSystemIds?: string[];

  @ApiProperty({
    description:
      'Array of key system identifiers to sort the usecases by. Defines the order in which keys should be used for sorting.',
    type: [String],
    required: false,
  })
  sortKeySystemIds?: string[];
}
