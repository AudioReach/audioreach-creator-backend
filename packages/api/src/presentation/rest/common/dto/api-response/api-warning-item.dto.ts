/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Represents a single warning item in an API response.
 * Used in ApiResult.warnings for non-fatal notices alongside successful data.
 */
export class ApiWarningItem {
  @ApiProperty({
    description:
      'Machine-readable warning code (e.g., DEPRECATED_FORMAT, PARTIAL_DATA)',
    type: 'string',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable warning detail',
    type: 'string',
  })
  message!: string;
}
