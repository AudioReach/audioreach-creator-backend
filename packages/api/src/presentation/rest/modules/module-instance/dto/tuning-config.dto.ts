import {ApiProperty} from '@nestjs/swagger';
import {KeyValuePairsInfo, KeyValueInfo} from '../../../common/dto/kv.dto.js';

/**
 * CKV (Calibration Key-Value) DTO extending KeyValuePairsInfo
 */
export class CkvDto extends KeyValuePairsInfo {
  @ApiProperty({
    description: 'CKV system ID',
    type: String,
    example: '101',
  })
  declare systemId: string;

  constructor(systemId: string, keyValueCollection: KeyValueInfo[]) {
    super(keyValueCollection);
    this.systemId = systemId;
  }
}

/**
 * TKV (Tag Key-Value) DTO extending KeyValuePairsInfo
 */
export class TkvDto extends KeyValuePairsInfo {
  @ApiProperty({
    description: 'TKV system ID',
    type: String,
    example: '202',
  })
  declare systemId: string;

  constructor(systemId: string, keyValueCollection: KeyValueInfo[]) {
    super(keyValueCollection);
    this.systemId = systemId;
  }
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
