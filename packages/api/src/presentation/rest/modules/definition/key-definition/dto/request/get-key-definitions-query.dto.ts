/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiPropertyOptional} from '@nestjs/swagger';
import {KeyType} from '../../../../../common/enums/key-definition/key-type.enum.js';

export class GetKeyDefinitionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by key definition id',
  })
  keyDefinitionId?: string;

  @ApiPropertyOptional({
    description: 'Filter by key type',
    enum: KeyType,
  })
  keyType?: KeyType;

  @ApiPropertyOptional({
    description: 'Filter by voice keys only (true/false)',
    type: Boolean,
  })
  isVoice?: boolean;
}
