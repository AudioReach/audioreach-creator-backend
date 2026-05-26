/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Response DTO for data link creation
 */
export class CreateDataLinkResponse {
  @ApiProperty({
    description: 'Whether the data link creation was successful',
    type: 'boolean',
  })
  success!: boolean;

  @ApiProperty({
    description:
      'Whether clients should refresh by calling /usecases/query API',
    type: 'boolean',
  })
  shouldRefresh!: boolean;

  @ApiProperty({
    description: 'Optional message providing additional context',
    type: 'string',
    required: false,
  })
  message?: string;
}
