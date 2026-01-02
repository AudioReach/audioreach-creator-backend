import {BaseComponentDto, PropertyDto} from '../../../common/dto/index.js';
import {ComponentInfoType} from '../../../common/utils/index.js';
import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for container properties
 */
export class ContainerPropertiesDto {
  @ApiProperty({
    description: 'Array of container properties',
    type: [PropertyDto],
  })
  properties: PropertyDto[];

  constructor(properties: PropertyDto[]) {
    this.properties = properties;
  }
}

export class ContainerDto extends BaseComponentDto<number> {
  get componentType(): ComponentInfoType {
    return ComponentInfoType.Subgraph;
  }

  constructor(sysemId: string, id: number) {
    super(sysemId, id);
  }
}
