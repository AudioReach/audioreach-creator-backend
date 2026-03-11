/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiPropertyOptional} from '@nestjs/swagger';

export class GetTagDefinitionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by tag definition id',
  })
  tagDefinitionId?: string;
}
