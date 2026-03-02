/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, OmitType, PartialType} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {KeyDefinitionDto} from '../../../../../common/dto/key-definition/key-definition.dto.js';
import {ValueDefinitionDto} from '../../../../../common/dto/key-definition/value-definition.dto.js';

export class CreateValueDefinitionDto extends PartialType(
  OmitType(ValueDefinitionDto, ['systemId', 'changeInfo'] as const),
) {}

export class CreateKeyDefinitionRequestDto extends PartialType(
  OmitType(KeyDefinitionDto, ['systemId', 'changeInfo'] as const),
) {
  @ApiProperty({
    description: 'Values associated with the key',
    required: false,
    type: () => [CreateValueDefinitionDto],
  })
  @Type(() => CreateValueDefinitionDto)
  values?: CreateValueDefinitionDto[];
}
