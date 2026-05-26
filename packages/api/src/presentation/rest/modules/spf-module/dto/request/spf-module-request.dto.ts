/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsNumber} from 'class-validator';

/**
 * Request DTO for creating a new SPF module.
 * All fields except moduleSystemId and procId are optional.
 * If optional fields are not provided, the backend will create defaults.
 */
export class CreateSpfModuleRequest {
  @ApiProperty({
    description: 'Module system ID (module definition ID)',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  moduleSystemId!: number;

  @ApiProperty({
    description: 'Processor ID',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  procSystemId!: number;
  @ApiProperty({
    description: 'Parent ID. Optional.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  parentId?: number;

  @ApiProperty({
    description:
      'Subgraph ID. If not provided, a new subgraph will be created automatically.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  subgraphSystemId?: number;

  @ApiProperty({
    description:
      'Container ID. If not provided, a new container will be created automatically.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  containerSystemId?: number;
}

/**
 * Request DTO for cloning an existing SPF module.
 */
export class CloneSpfModuleRequest {
  @ApiProperty({
    description: 'Reference spf-module system ID',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  readonly referenceModuleSystemId!: number;

  @ApiProperty({
    description: 'Target parent ID',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly parentId?: number;

  @ApiProperty({
    description:
      'Target subgraph ID. If not provided, a new subgraph will be created',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly subgraphSystemId?: number;

  @ApiProperty({
    description:
      'Target container ID. If not provided, a new container will be created',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  readonly containerSystemId?: number;
}
