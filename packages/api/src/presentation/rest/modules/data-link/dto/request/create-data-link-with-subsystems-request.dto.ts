/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IsEnum, IsNotEmpty, IsString} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';
import {DATA_LINK_TYPE, type DataLinkType} from '@arc/core';

export class CreateDataLinkWithSubsystemsRequest {
  @ApiProperty({
    description: 'System ID of the source node (module or subsystem)',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  sourceNodeSystemId!: string;

  @ApiProperty({description: 'System ID of the source port', type: 'string'})
  @IsNotEmpty()
  @IsString()
  sourcePortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination node (module or subsystem)',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  destinationNodeSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination port',
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
