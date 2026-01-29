/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsOptional, IsString, ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';

export class SubgraphKvSelectionDto {
  @ApiProperty({description: 'System ID of the subgraph', type: String})
  @IsString()
  systemId!: string;

  @ApiProperty({
    description:
      'Selected SGKV cases for this subgraph — each inner array is one case, containing the value system IDs of the KVs active in that case',
    type: 'array',
    items: {type: 'array', items: {type: 'string'}},
  })
  @IsArray()
  valueSystemIds!: string[][];
}

export class CreateUsecasesRequestDto {
  @ApiProperty({
    description: 'System IDs of selected usecases',
    type: [String],
  })
  @IsArray()
  @IsString({each: true})
  selectedUsecaseSystemIds!: string[];

  @ApiProperty({
    description: 'Active subgraphs with their selected SGKV combinations',
    type: [SubgraphKvSelectionDto],
  })
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => SubgraphKvSelectionDto)
  activeSubgraphs!: SubgraphKvSelectionDto[];

  @ApiProperty({
    description: 'System IDs of data links to exclude from routing',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  excludedDataLinkSystemIds?: string[];

  @ApiProperty({
    description: 'System IDs of control links to exclude from routing',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  excludedControlLinkSystemIds?: string[];
}
