/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ApiIssueItem} from './api-issue-item.dto.js';

export class ApiResult<T> {
  @ApiProperty({required: false})
  data?: T;

  @ApiProperty({type: [ApiIssueItem], required: false})
  issues?: ApiIssueItem[];

  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;
}
