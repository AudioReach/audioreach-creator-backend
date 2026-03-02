/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {OmitType, PartialType} from '@nestjs/swagger';
import {KeyDefinitionDto} from '../../../../../common/dto/key-definition/key-definition.dto.js';

export class PatchKeyDefinitionRequestDto extends PartialType(
  OmitType(KeyDefinitionDto, ['systemId', 'changeInfo'] as const),
) {}
