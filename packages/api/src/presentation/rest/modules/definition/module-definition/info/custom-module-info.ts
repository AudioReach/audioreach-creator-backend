import {ApiProperty} from '@nestjs/swagger';

export class CustomModuleInfo {
  @ApiProperty({description: 'Major type identifier'})
  majorTypeId!: number; // corresponds to uint

  @ApiProperty({description: 'Interface type identifier'})
  interfaceTypeId!: number; // corresponds to ushort

  @ApiProperty({description: 'Interface version identifier'})
  interfaceVersionId!: number; // corresponds to ushort

  @ApiProperty({description: 'File name of the module'})
  fileName!: string;

  @ApiProperty({description: 'Entry point tag of the module'})
  entryPointTag!: string;
}
