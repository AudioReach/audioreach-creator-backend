/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export abstract class BaseKeyDefinitionDto {
  @ApiProperty({description: 'Unique system identifier for the key'})
  systemId!: string;

  @ApiProperty({description: 'Key identifier'})
  keyId!: number;

  @ApiProperty({description: 'Key name'})
  name!: string;

  @ApiProperty({description: 'Key description', required: false})
  description?: string;
}
