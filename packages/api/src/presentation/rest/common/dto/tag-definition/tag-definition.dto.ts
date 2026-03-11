/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {BaseDto} from '../base.dto.js';
import {TagDefinitionCHeaderDto} from './tag-definition-c-header.dto.js';
import {TagDefinitionKeyDetailDto} from './tag-definition-key.dto.js';

export class TagDefinitionSummaryDto extends BaseDto {
  @ApiProperty({description: 'Unique system identifier for the tag'})
  systemId!: string;

  @ApiProperty({description: 'Tag identifier'})
  tagId!: number;

  @ApiProperty({description: 'Tag name'})
  name!: string;
}

export class TagDefinitionDto extends TagDefinitionSummaryDto {
  @ApiProperty({
    description:
      'C header enum fields for pseudo header file. Null if not applicable.',
    nullable: true,
    type: () => TagDefinitionCHeaderDto,
  })
  @Type(() => TagDefinitionCHeaderDto)
  cHeaderAttribute!: TagDefinitionCHeaderDto | null;
}

export class TagDefinitionDetailDto extends TagDefinitionDto {
  @ApiProperty({
    description: 'List of key definitions associated with this tag',
    type: () => TagDefinitionKeyDetailDto,
    isArray: true,
  })
  @Type(() => TagDefinitionKeyDetailDto)
  keys!: TagDefinitionKeyDetailDto[];
}
