import { ApiProperty } from '@nestjs/swagger';

export class ValueDefinitionInfo {
  @ApiProperty({ description: 'Unique system identifier for the value' })
  systemId!: string;

  @ApiProperty({ description: 'Value identifier' })
  valueId!: number;

  @ApiProperty({ description: 'Value name' })
  name!: string;

  @ApiProperty({ description: 'Value description', required: false })
  description?: string;

  @ApiProperty({ description: 'Value enum value for pseudo header file'})
  cHeaderEnumValue!: string;

  @ApiProperty({ description: 'Special value (present if specialKey is SampleRate or Volume)', required: false })
  specialValue?: string;
}
