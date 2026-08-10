/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDefinitionSummaryInfo} from './parameter-definition-summary-info.js';
import type {DefinitionElementDto} from '../dto/definition-element.dto.js';

export class ParameterDefinitionInfo extends ParameterDefinitionSummaryInfo {
  @ApiProperty({
    description: 'Parameter structure elements',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/DefinitionConfigElementDto'},
        {$ref: '#/components/schemas/DefinitionConfigElementArrayDto'},
        {$ref: '#/components/schemas/DefinitionStructDto'},
        {$ref: '#/components/schemas/DefinitionStructArrayDto'},
      ],
    },
  })
  elements!: DefinitionElementDto[];
}
