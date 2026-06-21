/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import {Type} from 'class-transformer';

/**
 * Request DTO for creating a new SPF module.
 * All fields except moduleSystemId and procId are optional.
 * If optional fields are not provided, the backend will create defaults.
 */
export class CreateSpfModuleRequestDto {
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
export class CloneSpfModuleRequestDto {
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

/**
 * Single CKV creation item specifying value system IDs that identify the calibration bin.
 */
export class CreateCkvRequestItem {
  @ApiProperty({
    description:
      'Array of value system IDs that identify this calibration bin (key-value pairs)',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  valueSystemIds!: number[];
}

/**
 * Request DTO for adding one or more CKVs to an SPF module.
 * Supports batch creation of multiple calibration bins.
 */
export class CreateCkvsRequestDto {
  @ApiProperty({
    description: 'Array of CKV creation items',
    type: [CreateCkvRequestItem],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({each: true})
  @Type(() => CreateCkvRequestItem)
  ckvs!: CreateCkvRequestItem[];
}

/**
 * Request DTO for removing one or more CKVs from an SPF module.
 */
export class DeleteCkvsRequestDto {
  @ApiProperty({
    description: 'Array of CKV system IDs to remove',
    type: [String],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({each: true})
  ckvSystemIds!: string[];
}

/**
 * Request DTO for adding (associating) one or more tags to an SPF module.
 */
export class CreateTagsRequestDto {
  @ApiProperty({
    description: 'Array of tag definition system IDs to associate with module',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  tagDefinitionSystemIds!: number[];
}

/**
 * Request DTO for removing (disassociating) one or more tags from an SPF module.
 */
export class DeleteTagsRequestDto {
  @ApiProperty({
    description:
      'Array of tag system IDs (module_tag_id_map system IDs) to remove',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  tagSystemIds!: number[];
}

/**
 * Single TKV creation item specifying value system IDs and optional parameters.
 */
export class CreateTkvRequestItem {
  @ApiProperty({
    description:
      'Array of value system IDs that identify this tag bin (key-value pairs)',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  valueSystemIds!: number[];

  @ApiProperty({
    description: 'Array of parameter system IDs for this TKV.',
    type: [Number],
    required: true,
  })
  @IsArray()
  @IsNumber({}, {each: true})
  parameterSystemIds!: number[];
}

/**
 * Request DTO for adding one or more TKVs to a specific tag.
 * Supports batch creation of multiple tag bins.
 */
export class CreateTkvsRequestDto {
  @ApiProperty({
    description: 'Array of TKV creation items',
    type: [CreateTkvRequestItem],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({each: true})
  @Type(() => CreateTkvRequestItem)
  tkvs!: CreateTkvRequestItem[];
}

/**
 * Request DTO for removing one or more TKVs from a tag.
 */
export class DeleteTkvsRequestDto {
  @ApiProperty({
    description: 'Array of TKV system IDs to remove',
    type: [String],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({each: true})
  tkvSystemIds!: string[];
}

/**
 * Request DTO for adding parameters to all CKVs in an SPF module.
 */
export class CreateCkvParametersRequestDto {
  @ApiProperty({
    description:
      'Array of parameter system IDs to add to all CKVs in the module',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  parameterSystemIds!: number[];
}

/**
 * Request DTO for removing parameters from all CKVs in an SPF module.
 */
export class DeleteCkvParametersRequestDto {
  @ApiProperty({
    description:
      'Array of parameter system IDs to remove from all CKVs in the module',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  parameterSystemIds!: number[];
}

/**
 * Single TKV parameter update item for adding parameters to a specific TKV.
 */
export class TkvParameterItem {
  @ApiProperty({
    description: 'TKV system ID to update',
    type: String,
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  tkvSystemId!: string;

  @ApiProperty({
    description: 'Array of parameter system IDs to add/remove for this TKV',
    type: [Number],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, {each: true})
  parameterSystemIds!: number[];
}

/**
 * Request DTO for adding parameters to specific TKVs.
 */
export class CreateTkvParametersRequestDto {
  @ApiProperty({
    description: 'Array of TKV parameter updates',
    type: [TkvParameterItem],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({each: true})
  @Type(() => TkvParameterItem)
  updates!: TkvParameterItem[];
}

/**
 * Request DTO for removing parameters from specific TKVs.
 */
export class RemoveTkvParametersRequestDto {
  @ApiProperty({
    description: 'Array of TKV parameter updates',
    type: [TkvParameterItem],
    required: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({each: true})
  @Type(() => TkvParameterItem)
  updates!: TkvParameterItem[];
}
