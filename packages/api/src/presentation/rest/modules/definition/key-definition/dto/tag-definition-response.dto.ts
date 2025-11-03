// tag-definition.response.ts
import { ApiProperty } from '@nestjs/swagger';
import {  Type } from 'class-transformer';
import { TagKeyDefinitionInfo } from '../info/tag-key-definition-info.js';

export class TagDefinitionResponseDto {
  
  
  @ApiProperty({ description: 'Unique system identifier for the tag' })
  systemId!: string;

  @ApiProperty({ description: 'Tag identifier' })
  tagId!: number;

  @ApiProperty({ description: 'Tag name' })
  name!: string;

  @ApiProperty({ description: 'Tag enum value for pseudo header file', required: false })
  cHeaderEnumValue?: string;

  @ApiProperty({ description: 'Tag enum name for pseudo header file', required: false })
  cHeaderEnumName?: string;

  @ApiProperty({ description: 'List of tag key supported', type: [TagKeyDefinitionInfo],required:false })
  @Type(() => TagKeyDefinitionInfo)
  keyDefinitions?: TagKeyDefinitionInfo[];
}
