/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  KeyValuePairsInfo,
  KeyValueInfo,
} from '../../../../common/dto/kv.dto.js';

/**
 * Parameter information DTO containing parameter ID, system ID, name and description
 */
export class ParamInfo {
  @ApiProperty({
    description: 'Parameter ID',
    type: Number,
  })
  paramId: number;

  @ApiProperty({
    description: 'Parameter system ID',
    type: String,
  })
  paramSystemId: string;

  @ApiProperty({
    description: 'Parameter name',
    type: String,
  })
  name: string;

  @ApiProperty({
    description: 'Parameter description',
    type: String,
  })
  description: string;

  constructor(
    paramId: number,
    paramSystemId: string,
    name: string,
    description: string,
  ) {
    this.paramId = paramId;
    this.paramSystemId = paramSystemId;
    this.name = name;
    this.description = description;
  }
}

/**
 * Base class for key-value DTOs with system ID and supported parameters
 */
abstract class BaseKeyValueDto extends KeyValuePairsInfo {
  declare systemId: string;
  supportedParameters: ParamInfo[];

  constructor(
    systemId: string,
    keyValueCollection: KeyValueInfo[],
    supportedParameters: ParamInfo[],
  ) {
    super(keyValueCollection);
    this.systemId = systemId;
    this.supportedParameters = supportedParameters;
  }
}

/**
 * CKV (Calibration Key-Value) DTO extending BaseKeyValueDto
 */
export class CkvDto extends BaseKeyValueDto {
  @ApiProperty({
    description: 'CKV system ID',
    type: String,
  })
  declare systemId: string;

  @ApiProperty({
    description: 'Supported parameters for this CKV',
    type: [ParamInfo],
  })
  declare supportedParameters: ParamInfo[];
}

/**
 * TKV (Tag Key-Value) DTO extending BaseKeyValueDto
 */
export class TkvDto extends BaseKeyValueDto {
  @ApiProperty({
    description: 'TKV system ID',
    type: String,
  })
  declare systemId: string;

  @ApiProperty({
    description: 'Supported parameters for this TKV',
    type: [ParamInfo],
  })
  declare supportedParameters: ParamInfo[];
}

/**
 * Tag information DTO containing tag details and its TKVs
 */
export class TagInfoDto {
  @ApiProperty({
    description: 'Tag system ID',
    type: String,
  })
  systemId: string;

  @ApiProperty({
    description: 'Tag ID',
    type: Number,
  })
  tagId: number;

  @ApiProperty({
    description: 'Tag name',
    type: String,
  })
  tagName: string;

  @ApiProperty({
    description: 'Tag key-values configuration',
    type: [TkvDto],
    required: false,
  })
  tkvs: TkvDto[];

  constructor(
    systemId: string,
    tagId: number,
    tagName: string,
    tkvs: TkvDto[] = [],
  ) {
    this.systemId = systemId;
    this.tagId = tagId;
    this.tagName = tagName;
    this.tkvs = tkvs;
  }
}
