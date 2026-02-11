/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BasePropertyDescriptionResponseDto} from './base-property-definition-response.dto.js';

export class SubgraphPropertyDefinitionSummaryResponseDto extends BasePropertyDescriptionResponseDto {
  @ApiProperty({description: 'Indicates if the property is voice'})
  isVoice!: boolean;
}
