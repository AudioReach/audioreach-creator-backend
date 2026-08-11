/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsNumber} from 'class-validator';

export class CloneSubgraphRequest {
  @ApiProperty({description: 'Reference Subgraph ID'})
  @IsNotEmpty()
  @IsNumber()
  refSubgraphId!: number;

  @ApiProperty({description: 'Target parent ID', required: false})
  @IsOptional()
  @IsNumber()
  targetParentId?: number;
}
