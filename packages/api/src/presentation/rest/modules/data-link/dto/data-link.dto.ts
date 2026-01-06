import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from '../../../common/dto/index.js';
import {
  ComponentInfoType,
  CONN_CTRL_TYPE,
} from '../../../common/utils/enums.js';

/**
 * DTO for data link
 */
export class DataLinkDto extends BaseComponentDto<number> {
  @ApiProperty({
    description: 'Source component ID',
    example: 12_345,
  })
  sourceId: number;

  @ApiProperty({
    description: 'Source port ID',
    example: 1,
  })
  sourcePortId: number;

  @ApiProperty({
    description: 'Destination component ID',
    example: 67_890,
  })
  destinationId: number;

  @ApiProperty({
    description: 'Destination port ID',
    example: 2,
  })
  destinationPortId: number;

  @ApiProperty({
    description: 'Parent ID',
    example: 54_321,
    required: false,
  })
  parentId?: number;

  @ApiProperty({
    description: 'Is dangling',
    example: false,
  })
  isDangling: boolean;

  @ApiProperty({
    description: 'Connection type',
    enum: CONN_CTRL_TYPE,
    example: CONN_CTRL_TYPE.MODULE_MODULE,
  })
  connectionType: CONN_CTRL_TYPE;

  constructor(
    systemId: string,
    id: number,
    connectionType: CONN_CTRL_TYPE,
    sourceId: number,
    sourcePortId: number,
    destinationId: number,
    destinationPortId: number,
    isDangling: boolean,
    parentId?: number,
  ) {
    super(systemId, id);
    this.sourceId = sourceId;
    this.sourcePortId = sourcePortId;
    this.destinationId = destinationId;
    this.destinationPortId = destinationPortId;
    this.isDangling = isDangling;
    this.connectionType = connectionType;
    this.parentId = parentId;
    this.componentType = ComponentInfoType.DataLink;
  }
}
