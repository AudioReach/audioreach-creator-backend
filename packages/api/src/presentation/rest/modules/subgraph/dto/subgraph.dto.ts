/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsNumber} from 'class-validator';
import {BaseComponentDto, PropertyDto} from '../../../common/dto/index.js';
import {KeyValuePairsInfo} from '../../../common/dto/kv.dto.js';
import {SharedType} from '../../../common/utils/index.js';

/**
 * DTO for subgraph properties
 */
export class SubgraphPropertiesDto {
  @ApiProperty({
    description: 'Array of subgraph properties',
    type: [PropertyDto],
  })
  properties: PropertyDto[];

  constructor(properties: PropertyDto[]) {
    this.properties = properties;
  }
}

export class SubgraphDto extends BaseComponentDto<number> {
  @ApiProperty({
    description: 'Subgraph shared type',
    enum: SharedType,
    default: SharedType.None,
  })
  subGraphSharedType: SharedType = SharedType.None;

  @ApiProperty({
    description: 'SGKV - List of KV information',
    type: [KeyValuePairsInfo],
  })
  SGKV: KeyValuePairsInfo[] = [];

  constructor(systemId: string, id: number) {
    super(systemId, id);
  }
}

/**
 * Request DTO for cloning a subgraph
 */
export class CloneSubgraphRequest {
  @ApiProperty({description: 'Reference Subgraph ID'})
  @IsNotEmpty()
  @IsNumber()
  refSubgraphId!: number;

  @ApiProperty({description: 'Target parent ID', required: false})
  @IsOptional()
  @IsNumber()
  targetParentId?: number;
}
