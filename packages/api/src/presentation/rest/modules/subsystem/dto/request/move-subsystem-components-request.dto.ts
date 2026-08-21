/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsOptional, IsString} from 'class-validator';

/**
 * Request DTO for moving subgraphs or subsystems to a target subsystem.
 * At least one of subgraphSystemIds or subsystemSystemIds must be provided.
 */
export class MoveSubsystemComponentsRequestDto {
  @ApiProperty({
    type: [String],
    description: 'System IDs of the subgraphs to move.',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  subgraphSystemIds?: string[];

  @ApiProperty({
    type: [String],
    description: 'System IDs of the subsystems to move.',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  subsystemSystemIds?: string[];

  @ApiProperty({
    type: 'string',
    nullable: true,
    description:
      'System ID of the target subsystem. null moves components to root.',
  })
  @IsOptional()
  @IsString()
  targetSubsystemSystemId!: string | null;
}
