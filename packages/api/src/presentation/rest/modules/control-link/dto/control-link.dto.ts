import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto, BaseValueElement} from '../../../common/dto/index.js';
import {
  ComponentInfoType,
  CONN_CTRL_TYPE,
} from '../../../common/utils/enums.js';

/**
 * DTO for control port intents
 */
export class ControlLinkIntentsDto {
  @ApiProperty({
    description: 'Control Link Intent Propety',
  })
  readonly propId: number = 0x08_00_10_62; //intent property id.
  readonly propName: string = 'Inents Property';

  intents: IntentDto[];

  constructor(controlPortIntents: IntentDto[]) {
    this.intents = controlPortIntents;
  }
}

export class IntentDto {
  @ApiProperty({
    description: 'Intent ID',
    example: 0x08_00_10_c2,
  })
  id: number;

  @ApiProperty({
    description: 'Intent name',
    example: 'VFR drift info',
  })
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }
}

/**
 * DTO for control port intent
 */
export class ControlLinkHeapIdDto {
  @ApiProperty({
    description: 'Control Link HeapId Propety',
  })
  readonly propId: number = 0x08_00_13_6f; //heapId property id.
  readonly propName: string = 'Heap Property';

  heapId: BaseValueElement;

  constructor(id: BaseValueElement) {
    this.heapId = id;
  }
}

/**
 * DTO for control link properties
 */
export class ControlLinkPropertiesDto {
  @ApiProperty({
    description: 'Allocated Intents',
    type: ControlLinkIntentsDto,
  })
  AllocatedIntents: ControlLinkIntentsDto;

  @ApiProperty({
    description: 'Supported Intents',
    type: ControlLinkIntentsDto,
    required: false,
  })
  SupportedIntents?: ControlLinkIntentsDto;

  @ApiProperty({
    description: 'HeapId',
    type: ControlLinkHeapIdDto,
  })
  HeapId: ControlLinkHeapIdDto;

  constructor(
    allocatedIntents: ControlLinkIntentsDto,
    heapId: ControlLinkHeapIdDto,
    supportedIntents?: ControlLinkIntentsDto,
  ) {
    this.AllocatedIntents = allocatedIntents;
    this.SupportedIntents = supportedIntents;
    this.HeapId = heapId;
  }
}

/**
 * DTO for control link
 */
export class ControlLinkDto extends BaseComponentDto<number> {
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

  get componentType(): ComponentInfoType {
    return ComponentInfoType.ControlLink;
  }

  constructor(
    systemId: string,
    id: number,
    connectionType: CONN_CTRL_TYPE,
    sourceId: number,
    sourcePortId: number,
    destinationId: number,
    destinationPortId: number,
    isDangling: boolean,
    parentId: number | undefined,
  ) {
    super(systemId, id);
    this.sourceId = sourceId;
    this.sourcePortId = sourcePortId;
    this.destinationId = destinationId;
    this.destinationPortId = destinationPortId;
    this.isDangling = isDangling;
    this.connectionType = connectionType;
    this.parentId = parentId;
  }
}
