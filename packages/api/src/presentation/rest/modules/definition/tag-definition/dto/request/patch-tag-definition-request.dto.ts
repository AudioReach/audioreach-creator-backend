/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {OmitType, PartialType} from '@nestjs/swagger';
import {TagDefinitionDto} from '../../../../../common/dto/tag-definition/tag-definition.dto.js';

export class PatchTagDefinitionRequestDto extends PartialType(
  OmitType(TagDefinitionDto, ['systemId', 'changeInfo'] as const),
) {}
