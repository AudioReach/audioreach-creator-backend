/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, ArrayNotEmpty, IsString} from 'class-validator';

/**
 * Request DTO for moving components into or out of a subsystem.
 */
export class MoveSubsystemComponentsRequestDto {
  @ApiProperty({
    type: [String],
    description:
      'System IDs of the components (subgraphs or SPF modules) to move',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({each: true})
  componentSystemIds!: string[];
}
