/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {Type} from 'class-transformer';

/**
 * DTO for creating a new control link (flat view — module nodes only)
 */
export class CreateControlLinkFlatRequest {
  @ApiProperty({description: 'System ID of the start module node'})
  @IsNotEmpty()
  @IsString()
  startModuleSystemId!: string;

  @ApiProperty({description: 'System ID of the control port on the start module'})
  @IsNotEmpty()
  @IsString()
  startPortId!: string;

  @ApiProperty({description: 'System ID of the end module node'})
  @IsNotEmpty()
  @IsString()
  endModuleSystemId!: string;

  @ApiProperty({description: 'System ID of the control port on the end module'})
  @IsNotEmpty()
  @IsString()
  endPortId!: string;

  @ApiProperty({description: 'System ID of the parent subsystem node', required: false})
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({description: 'Whether the link crosses usecase boundaries', default: false, required: false})
  @IsOptional()
  @IsBoolean()
  isInterUsecase?: boolean;

  @ApiProperty({description: 'Heap ID for memory allocation. Defaults to 1.', default: 1, required: false})
  @IsOptional()
  @IsInt()
  heapId?: number;
}

/**
 * DTO for creating a control link (hierarchical view — modules and subsystem nodes accepted)
 */
export class CreateControlLinkWithSubsystemsRequest {
  @ApiProperty({description: 'System ID of the start component node (module or subsystem)'})
  @IsNotEmpty()
  @IsString()
  startComponentId!: string;

  @ApiProperty({description: 'System ID of the control port on the start component'})
  @IsNotEmpty()
  @IsString()
  startPortId!: string;

  @ApiProperty({description: 'System ID of the end component node (module or subsystem)'})
  @IsNotEmpty()
  @IsString()
  endComponentId!: string;

  @ApiProperty({description: 'System ID of the control port on the end component'})
  @IsNotEmpty()
  @IsString()
  endPortId!: string;

  @ApiProperty({description: 'System ID of the parent subsystem node', required: false})
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({description: 'Whether the link crosses usecase boundaries', default: false, required: false})
  @IsOptional()
  @IsBoolean()
  isInterUsecase?: boolean;
}

export class IntentDto {
  @ApiProperty({description: 'Intent numeric ID'})
  @IsInt()
  id!: number;

  @ApiProperty({description: 'Intent name'})
  @IsString()
  name!: string;
}

export class AllocatedIntentsDto {
  @ApiProperty({description: 'Array of allocated intents', type: [IntentDto]})
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => IntentDto)
  intents!: IntentDto[];
}

export class HeapIdValueDto {
  @ApiProperty({description: 'Heap ID value'})
  @IsInt()
  value!: number;
}

/**
 * DTO for patching control link properties (intents or heapId)
 */
export class PatchControlLinkPropertiesRequest {
  @ApiProperty({
    description: 'New allocated intents to apply to all ports in the connected chain',
    required: false,
    type: AllocatedIntentsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AllocatedIntentsDto)
  AllocatedIntents?: AllocatedIntentsDto;

  @ApiProperty({
    description: 'New heap ID value',
    required: false,
    type: HeapIdValueDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeapIdValueDto)
  HeapId?: HeapIdValueDto;
}

/**
 * DTO for querying control links by system IDs
 */
export class QueryControlLinksRequest {
  @ApiProperty({
    description: 'List of control-link system IDs to look up',
    type: [String],
  })
  @IsArray()
  @IsString({each: true})
  @IsNotEmpty({each: true})
  systemIds!: string[];
}
