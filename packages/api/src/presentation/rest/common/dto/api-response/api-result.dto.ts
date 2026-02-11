/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class ApiResult<T> {
  @ApiProperty({required: false})
  data?: T;

  @ApiProperty({type: [String], required: false})
  errors?: string[];

  @ApiProperty({type: [String], required: false})
  warnings?: string[];

  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;
}
