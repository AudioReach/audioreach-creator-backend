/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IsBoolean, IsOptional, IsString} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';

export class CreateDataLinkWithSubsystemsRequest {
  @ApiProperty({
    description: 'System ID of the source node (module or subsystem)',
    type: 'string',
  })
  @IsString()
  sourceNodeSystemId!: string;

  @ApiProperty({description: 'System ID of the source port', type: 'string'})
  @IsString()
  sourcePortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination node (module or subsystem)',
    type: 'string',
  })
  @IsString()
  destinationNodeSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination port',
    type: 'string',
  })
  @IsString()
  destinationPortSystemId!: string;

  @ApiProperty({
    description:
      'If true, derives INTER_USECASE linkType. Only meaningful when both endpoints are modules.',
    type: 'boolean',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isInterUsecase?: boolean;

  @ApiProperty({
    description:
      'EC flag. Only valid when both endpoints are modules and derived linkType is INTRA_USECASE.',
    type: 'boolean',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isEc?: boolean;
}
