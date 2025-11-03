import { ApiProperty } from "@nestjs/swagger";
import { BaseKeyDefinitionDto } from "./base-key-definition.dto.js";
import { SpecialKey } from "../enums/special-key.enum.js";
import { ValueDefinitionInfo } from "../info/value-definition-info.js";
import { Type } from "class-transformer";

export class KeyDefinitionResponseDto extends BaseKeyDefinitionDto {

  @ApiProperty({ description: 'Key enum value for pseudo header file' })
  cHeaderEnumValue!: string;

  @ApiProperty({ description: 'Key enum name for pseudo header file' })
  cHeaderEnumName!: string;

  @ApiProperty({ description: 'Indicates if the key is a voice key' })
  isVoice!: boolean;

  @ApiProperty({ description: 'Indicates if the key is dynamic' })
  isDynamic!: boolean;

  @ApiProperty({ description: 'Special key', required: false, enum: SpecialKey })
  specialKey?: SpecialKey;

  @ApiProperty({ description: 'Values', type: [ValueDefinitionInfo] })
  @Type(() => ValueDefinitionInfo)
  values!: ValueDefinitionInfo[];

  @ApiProperty({ description: 'Indicates if the key is a calibration key' })
  isCalibrationKey!: boolean;

  @ApiProperty({ description: 'Indicates if the key is a graph key' })
  isGraphKey!: boolean;

  @ApiProperty({ description: 'Calibration key enum value for pseudo header file (required when isCalibrationKey is true)', required: false })
  cHeaderCalibrationKeyEnumValue?: string;

  @ApiProperty({ description: 'Graph key enum value for pseudo header file (required when isGraphKey is true)', required: false })
  cHeaderGraphKeyEnumValue?: string;

}
