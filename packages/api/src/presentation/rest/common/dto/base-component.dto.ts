import {IsDefined, IsNotEmpty, IsString, ValidateIf} from 'class-validator';
import {ComponentInfoType} from '../utils/enums.js';
import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';

export type EditType = 'Added' | 'Updated' | 'Deleted' | 'None';

/**
 * Converted from C# abstract class BaseComponentDTO<T>
 */
export class BaseComponentDto<T> {
  @ApiProperty({description: 'System ID'})
  readonly systemId!: string;

  @ApiProperty({description: 'Component ID'})
  readonly id!: T;

  @ApiProperty({description: 'Component name'})
  name?: string;

  @ApiProperty({
    description: 'Component type',
    enum: ComponentInfoType,
  })
  componentType!: ComponentInfoType;

  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  relatedEndPointLinks: EndPointLink[] = [];

  @ApiProperty({
    description: 'Edit type',
    enum: ['Added', 'Updated', 'Deleted', 'None'],
  })
  editType!: EditType;

  @ApiPropertyOptional({
    description:
      "Change identifier. REQUIRED if editType is not 'None'. Omit when editType = 'None'.",
    example: 'chg-12345',
  })
  @ValidateIf(o => o.editType !== 'None')
  @IsDefined({message: 'changeId is required when editType is not None'})
  @IsString()
  @IsNotEmpty({message: 'changeId must not be empty when editType is not None'})
  changeId?: string;

  constructor(systemId: string, id?: T) {
    this.systemId = systemId;
    if (id !== undefined) {
      (this as any).id = id;
    }
  }
}
