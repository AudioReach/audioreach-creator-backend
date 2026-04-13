/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseCategorySummaryDto} from './usecase-category-summary.dto.js';
import {UsecaseSummaryDto} from './usecase-summary.dto.js';

/**
 * Detail DTO extending base category with additional information.
 * Used for detailed category views that include full configuration data.
 */
export class UsecaseCategoryDetailDto extends UsecaseCategorySummaryDto {
  @ApiProperty({
    description: 'Array of usecases associated with this category',
    type: [UsecaseSummaryDto],
  })
  usecases!: UsecaseSummaryDto[];
}
