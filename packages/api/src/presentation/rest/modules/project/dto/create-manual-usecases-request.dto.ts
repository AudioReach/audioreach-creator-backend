/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsString, ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
import {SubgraphKvSelectionDto} from './create-usecases-request.dto.js';

export class CreateManualUsecasesRequestDto {
  @ApiProperty({
    description:
      'Effective manual routing scope, with each subgraph and its selected SGKV combinations',
    type: [SubgraphKvSelectionDto],
  })
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => SubgraphKvSelectionDto)
  activeSubgraphs!: SubgraphKvSelectionDto[];

  @ApiProperty({
    description: 'System IDs of data links to include in manual routing',
    type: [String],
  })
  @IsArray()
  @IsString({each: true})
  includedDataLinkSystemIds!: string[];

  @ApiProperty({
    description: 'System IDs of control links to include in manual routing',
    type: [String],
  })
  @IsArray()
  @IsString({each: true})
  includedControlLinkSystemIds!: string[];
}
