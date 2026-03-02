/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {OmitType, PartialType} from '@nestjs/swagger';
import {ValueDefinitionDto} from '../../../../../common/dto/key-definition/value-definition.dto.js';

export class CreateValueDefinitionRequestDto extends PartialType(
  OmitType(ValueDefinitionDto, ['systemId', 'changeInfo'] as const),
) {}
