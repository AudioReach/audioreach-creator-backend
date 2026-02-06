import {BasePropertyDescriptionResponseDto} from './base-property-definition-response.dto.js';
import {ApiProperty} from '@nestjs/swagger';

export class ContainerPropertyDefinitionDetailResponseDto extends BasePropertyDescriptionResponseDto {
  @ApiProperty({
    description: 'Property structure elements',
    type: 'array',
    items: {type: 'object'},
  })
  elements!: any[];
}
