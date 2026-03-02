/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {KeyDefinitionSummaryDto} from './key-definition.dto.js';
import {TagValueDefinitionDto} from './tag-value-definition.dto.js';

export class TagKeyDefinitionDto extends KeyDefinitionSummaryDto {
  @ApiProperty({description: 'Key description', required: false})
  description?: string;

  @ApiProperty({
    description: 'Tag key enum value for .c header file',
    required: false,
  })
  cHeaderEnumValue?: string;
}

export class TagKeyDefinitionDetailDto extends TagKeyDefinitionDto {
  @ApiProperty({
    description: 'List of value definitions associated with this tag key',
    type: () => TagValueDefinitionDto,
    isArray: true,
  })
  @Type(() => TagValueDefinitionDto)
  values!: TagValueDefinitionDto[];
}
