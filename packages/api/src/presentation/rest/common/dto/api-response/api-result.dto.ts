/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ApiErrorItem} from './api-error-item.dto.js';
import {ApiWarningItem} from './api-warning-item.dto.js';

export class ApiResult<T> {
  @ApiProperty({required: false})
  data?: T;

  @ApiProperty({type: [ApiErrorItem], required: false})
  errors?: ApiErrorItem[];

  @ApiProperty({type: [ApiWarningItem], required: false})
  warnings?: ApiWarningItem[];

  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;
}
