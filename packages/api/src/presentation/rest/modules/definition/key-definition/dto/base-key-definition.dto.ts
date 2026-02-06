import {ApiProperty} from '@nestjs/swagger';

export abstract class BaseKeyDefinitionDto {
  @ApiProperty({description: 'Unique system identifier for the key'})
  systemId!: string;

  @ApiProperty({description: 'Key identifier'})
  keyId!: number;

  @ApiProperty({description: 'Key name'})
  name!: string;

  @ApiProperty({description: 'Key description'})
  description?: string;
}
