/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ValueDefinitionSummaryDto} from './value-definition.dto.js';

export class TagValueDefinitionDto extends ValueDefinitionSummaryDto {
  @ApiProperty({description: 'Value description', required: false})
  description?: string;
}
