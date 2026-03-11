/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {KeyDefinitionSummaryDto} from '../key-definition/key-definition.dto.js';
import {ValueDefinitionSummaryDto} from '../key-definition/value-definition.dto.js';

export class TagDefinitionValueDto extends ValueDefinitionSummaryDto {
  @ApiProperty({description: 'Value description', required: false})
  description?: string;
}

export class TagDefinitionKeyDto extends KeyDefinitionSummaryDto {
  @ApiProperty({description: 'Key description', required: false})
  description?: string;

  @ApiProperty({
    description: 'Tag key enum value for .c header file',
    required: false,
  })
  cHeaderEnumValue?: string;
}

export class TagDefinitionKeyDetailDto extends TagDefinitionKeyDto {
  @ApiProperty({
    description: 'List of value definitions associated with this tag key',
    type: () => TagDefinitionValueDto,
    isArray: true,
  })
  @Type(() => TagDefinitionValueDto)
  values!: TagDefinitionValueDto[];
}
