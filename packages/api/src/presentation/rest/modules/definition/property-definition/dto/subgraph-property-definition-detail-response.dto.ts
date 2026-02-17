/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './subgraph-property-definition-summary-response.dto.js';
import type {DefinitionElementDto} from '../../module-definition/dto/definition-element.dto.js';

export class SubgraphPropertyDefinitionDetailResponseDto extends SubgraphPropertyDefinitionSummaryResponseDto {
  @ApiProperty({
    description: 'Property structure elements',
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
