import { ApiProperty } from "@nestjs/swagger";

export class TagValueDefinitionInfo
{
     @ApiProperty({ description: 'Unique system identifier for the value' })
      systemId!: string;
    
      @ApiProperty({ description: 'Value identifier' })
      valueId!: number;
    
      @ApiProperty({ description: 'Value name' })
      name!: string;
    
      @ApiProperty({ description: 'Value description', required: false })
      description?: string;
}