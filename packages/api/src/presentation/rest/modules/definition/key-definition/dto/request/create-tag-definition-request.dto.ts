/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, OmitType, PartialType} from '@nestjs/swagger';
import {TagDefinitionDto} from '../../../../../common/dto/key-definition/tag-definition.dto.js';

export class CreateTagDefinitionRequestDto extends PartialType(
  OmitType(TagDefinitionDto, ['systemId', 'changeInfo'] as const),
) {
  @ApiProperty({
    description:
      'List of system ids of key definitions to associate with the tag',
    required: false,
    type: [String],
  })
  keySystemIds?: string[];
}
