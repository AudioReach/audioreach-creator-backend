/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from './base.dto.js';

export class KeyDto {
  @ApiProperty({description: 'Key id', type: Number})
  keyId!: number;

  @ApiProperty({description: 'Key name', type: String})
  name!: string;

  @ApiProperty({description: 'Key system identifier', type: String})
  systemId!: string;
}

export class ValueDto {
  @ApiProperty({description: 'Value id', type: Number})
  valueId!: number;

  @ApiProperty({description: 'Value name', type: String})
  name!: string;

  @ApiProperty({description: 'Value system identifier', type: String})
  systemId!: string;
}

export class KeyValueDto {
  @ApiProperty({description: 'Key information', type: KeyDto})
  key!: KeyDto;

  @ApiProperty({description: 'Value information', type: ValueDto})
  value!: ValueDto;
}

export class KeyValuePairsDto extends BaseDto {
  @ApiProperty({
    description: 'Unique system identifier for the key-value pair collection',
    type: String,
  })
  systemId!: string;

  @ApiProperty({
    description: 'Array of key-value pair',
    type: [KeyValueDto],
  })
  keyValuePairs!: KeyValueDto[];
}
