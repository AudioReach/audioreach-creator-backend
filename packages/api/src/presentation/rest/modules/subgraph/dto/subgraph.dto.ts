/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {IsNotEmpty, IsOptional, IsNumber} from 'class-validator';
import {SubgraphPropertiesDtoSchema, SubgraphDtoSchema} from '@arc/core';

/**
 * DTO for subgraph properties
 */
export class SubgraphPropertiesResponseDto extends createZodDto(
  SubgraphPropertiesDtoSchema,
) {}

export class SubgraphResponseDto extends createZodDto(SubgraphDtoSchema) {}

/**
 * Request DTO for cloning a subgraph
 */
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
