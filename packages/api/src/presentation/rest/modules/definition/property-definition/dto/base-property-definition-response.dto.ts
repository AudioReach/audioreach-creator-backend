import {ApiProperty} from '@nestjs/swagger';
import {PropertyType} from '../enums/property-type.enum.js';

export class BasePropertyDescriptionResponseDto {
  @ApiProperty({description: 'System identifier'})
  systemId!: string;

  @ApiProperty({description: 'Property identifier'})
  propertyId!: number;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Property description'})
  description!: string;

  @ApiProperty({description: 'Property type', enum: PropertyType})
  type!: PropertyType;

  // @ApiProperty({ description: 'Property category identifier (required when type is SPF)', required: false })
  // categoryId?: number;

  // @ApiProperty({ description: 'Property category name (required when type is SPF)', required: false })
  // categoryName?: string;
}
