/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Represents a single error item in a bulk operation response.
 * Used in ApiResult.errors for partial-success bulk endpoints.
 */
export class ApiErrorItem {
  @ApiProperty({
    description: 'Identifier of the item that failed (if applicable)',
    required: false,
    type: 'string',
  })
  id?: string;

  @ApiProperty({
    description:
      'Machine-readable error code (e.g., DB_QUERY_FAILED, PARSE_ERROR)',
    type: 'string',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error detail',
    type: 'string',
  })
  message!: string;
}
