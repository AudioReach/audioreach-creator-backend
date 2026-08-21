/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsOptional, IsString, ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
import {SubgraphKvSelectionDto} from './create-usecases-request.dto.js';

export class CreateManualUsecasesRequestDto {
  @ApiProperty({
    description:
      'Subgraphs defining the manual usecase path with their selected SGKV combinations',
    type: [SubgraphKvSelectionDto],
  })
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => SubgraphKvSelectionDto)
  activeSubgraphs!: SubgraphKvSelectionDto[];

  @ApiProperty({
    description: 'System IDs of data links to exclude',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  excludedDataLinkSystemIds?: string[];

  @ApiProperty({
    description: 'System IDs of control links to exclude',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({each: true})
  excludedControlLinkSystemIds?: string[];
}
