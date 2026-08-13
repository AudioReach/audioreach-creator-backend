/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsString} from 'class-validator';

export class CloneSubgraphRequest {
  @ApiProperty({description: 'Reference Subgraph system ID'})
  @IsNotEmpty()
  @IsString()
  refSubgraphSystemId!: string;

  @ApiProperty({description: 'Target parent system ID', required: false})
  @IsOptional()
  @IsString()
  targetParentSystemId?: string;
}
