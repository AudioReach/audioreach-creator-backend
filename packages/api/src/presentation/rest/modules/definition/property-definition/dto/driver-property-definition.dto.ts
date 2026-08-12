/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class DriverPropertyDto {
  @ApiProperty({description: 'Property ID'})
  id!: string;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Maximum size in bytes'})
  maxSize!: string;

  @ApiProperty({description: 'Voice property flag', required: false})
  isVoice?: boolean;

  @ApiProperty({description: 'Property description'})
  description!: string;
}

/**
 * DTO representing Driver Property Definition
 */
export class DriverPropertyDefinitionDto {
  @ApiProperty({
    type: [DriverPropertyDto],
    description: 'List of driver properties',
  })
  properties!: DriverPropertyDto[];
}
