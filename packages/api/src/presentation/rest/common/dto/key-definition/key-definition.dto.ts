/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {BaseDto} from '../base.dto.js';
import {SpecialKey} from '../../enums/key-definition/special-key.enum.js';
import {KeyDefinitionCHeaderDto} from './key-definition-c-header.dto.js';
import {KeyType} from '../../enums/key-definition/key-type.enum.js';
import {ValueDefinitionDto} from './value-definition.dto.js';

export class KeyDefinitionSummaryDto extends BaseDto {
  @ApiProperty({description: 'Unique system identifier for key'})
  systemId!: string;

  @ApiProperty({description: 'Key identifier'})
  keyId!: number;

  @ApiProperty({description: 'Key name'})
  name!: string;
}

export class KeyDefinitionDto extends KeyDefinitionSummaryDto {
  @ApiProperty({description: 'Key type', enum: KeyType})
  keyType!: KeyType;

  @ApiProperty({description: 'Key description', required: false})
  description?: string;

  @ApiProperty({
    description:
      'C header enum fields for pseudo header file. Null if not applicable.',
    nullable: true,
    type: () => KeyDefinitionCHeaderDto,
  })
  @Type(() => KeyDefinitionCHeaderDto)
  cHeaderAttribute!: KeyDefinitionCHeaderDto | null;

  @ApiProperty({
    description: 'Indicates if the key is a voice key',
    required: false,
  })
  isVoice?: boolean;

  @ApiProperty({
    description: 'Indicates if the key is dynamic',
    required: false,
  })
  isDynamic?: boolean;

  @ApiProperty({description: 'Special key', required: false, enum: SpecialKey})
  specialKey?: SpecialKey;
}

export class KeyDefinitionDetailDto extends KeyDefinitionDto {
  @ApiProperty({
    description: 'List of value definitions associated with this key',
    type: () => ValueDefinitionDto,
    isArray: true,
  })
  @Type(() => ValueDefinitionDto)
  values!: ValueDefinitionDto[];
}
