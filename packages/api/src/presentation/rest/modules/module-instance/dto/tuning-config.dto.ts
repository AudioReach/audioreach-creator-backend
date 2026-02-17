/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {KeyValuePairsInfo, KeyValueInfo} from '../../../common/dto/kv.dto.js';

/**
 * Parameter information DTO containing parameter ID, system ID, name and description
 */
export class ParamInfo {
  @ApiProperty({
    description: 'Parameter ID',
    type: Number,
    example: 1001,
  })
  paramId: number;

  @ApiProperty({
    description: 'Parameter system ID',
    type: String,
    example: 'PARAM_SYS_001',
  })
  paramSystemId: string;

  @ApiProperty({
    description: 'Parameter name',
    type: String,
    example: 'SampleRate',
  })
  name: string;

  @ApiProperty({
    description: 'Parameter description',
    type: String,
    example: 'Audio sample rate configuration parameter',
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
    example: '101',
  })
  declare systemId: string;

  @ApiProperty({
    description: 'Supported parameters for this CKV',
    type: [ParamInfo],
    example: [
      {
        paramId: 1001,
        paramSystemId: 'PARAM_SYS_001',
        name: 'SampleRate',
        description: 'Audio sample rate configuration parameter',
      },
      {
        paramId: 1002,
        paramSystemId: 'PARAM_SYS_002',
        name: 'BitDepth',
        description: 'Audio bit depth configuration parameter',
      },
    ],
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
    example: '202',
  })
  declare systemId: string;

  @ApiProperty({
    description: 'Supported parameters for this TKV',
    type: [ParamInfo],
    example: [
      {
        paramId: 2001,
        paramSystemId: 'PARAM_SYS_003',
        name: 'Channels',
        description: 'Audio channel configuration parameter',
      },
      {
        paramId: 2002,
        paramSystemId: 'PARAM_SYS_004',
        name: 'Volume',
        description: 'Audio volume level parameter',
      },
    ],
  })
  declare supportedParameters: ParamInfo[];
}

/**
 * Tag information DTO containing tag details and its TKVs
 */
export class TagInfoDto {
  @ApiProperty({
    description: 'Tag system ID',
    type: Number,
    example: 201,
  })
  systemId: number;

  @ApiProperty({
    description: 'Tag ID',
    type: Number,
    example: 301,
  })
  tagId: number;

  @ApiProperty({
    description: 'Tag name',
    type: String,
    example: 'AudioProcessing',
  })
  tagName: string;

  @ApiProperty({
    description: 'Tag key-values configuration',
    type: [TkvDto],
    required: false,
    example: [
      {
        systemId: '202',
        supportedParameters: [
          {
            paramId: 2001,
            paramSystemId: 'PARAM_SYS_003',
            name: 'Channels',
            description: 'Audio channel configuration parameter',
          },
          {
            paramId: 2002,
            paramSystemId: 'PARAM_SYS_004',
            name: 'Volume',
            description: 'Audio volume level parameter',
          },
        ],
        keyValueCollection: [
          {keyId: 2, valueId: 20, keyLabel: 'Channels', valueLabel: 'Stereo'},
        ],
      },
    ],
  })
  tkvs: TkvDto[];

  constructor(
    systemId: number,
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

/**
 * Main response DTO for module instance tuning configuration
 */
export class ModuleInstanceTuningConfigDto {
  @ApiProperty({
    description: 'Module instance system ID',
    type: String,
    example: '12345',
  })
  moduleInstanceSystemId: string;

  @ApiProperty({
    description: 'Calibration key-values configuration',
    type: [CkvDto],
    example: [
      {
        systemId: '101',
        supportedParameters: [
          {
            paramId: 1001,
            paramSystemId: 'PARAM_SYS_001',
            name: 'SampleRate',
            description: 'Audio sample rate configuration parameter',
          },
          {
            paramId: 1002,
            paramSystemId: 'PARAM_SYS_002',
            name: 'BitDepth',
            description: 'Audio bit depth configuration parameter',
          },
        ],
        keyValueCollection: [
          {keyId: 1, valueId: 10, keyLabel: 'SampleRate', valueLabel: '48000'},
        ],
      },
    ],
  })
  ckvs: CkvDto[];

  @ApiProperty({
    description: 'Tag information containing tag key-values',
    type: [TagInfoDto],
    example: [
      {
        systemId: 201,
        tagId: 301,
        tagName: 'AudioProcessing',
        tkvs: [
          {
            systemId: '202',
            supportedParameters: [
              {
                paramId: 2001,
                paramSystemId: 'PARAM_SYS_003',
                name: 'Channels',
                description: 'Audio channel configuration parameter',
              },
              {
                paramId: 2002,
                paramSystemId: 'PARAM_SYS_004',
                name: 'Volume',
                description: 'Audio volume level parameter',
              },
            ],
            keyValueCollection: [
              {
                keyId: 2,
                valueId: 20,
                keyLabel: 'Channels',
                valueLabel: 'Stereo',
              },
            ],
          },
        ],
      },
    ],
  })
  tags: TagInfoDto[];

  constructor(
    moduleInstanceSystemId: string,
    ckvs: CkvDto[] = [],
    tags: TagInfoDto[] = [],
  ) {
    this.moduleInstanceSystemId = moduleInstanceSystemId;
    this.ckvs = ckvs;
    this.tags = tags;
  }
}
