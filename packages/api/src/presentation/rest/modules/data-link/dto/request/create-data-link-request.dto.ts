/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IsEnum, IsNotEmpty, IsString} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';
import {DATA_LINK_TYPE, type DataLinkType} from '@arc/core';

export class CreateDataLinkRequest {
  @ApiProperty({
    description: 'System ID of the source module node',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  sourceModuleSystemId!: string;

  @ApiProperty({
    description: 'System ID of the source port (must be OUTPUT)',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  sourcePortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination module node',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  destinationModuleSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination port (must be INPUT)',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  destinationPortSystemId!: string;

  @ApiProperty({
    description: 'Topology classification of the link',
    enum: DATA_LINK_TYPE,
  })
  @IsEnum(DATA_LINK_TYPE)
  linkType!: DataLinkType;
}
