import { ApiProperty } from "@nestjs/swagger";
import { BaseKeyDefinitionDto } from "../dto/base-key-definition.dto.js";
import { TagValueDefinitionInfo } from "./tag-value-definition-info.js";
import { Type } from "class-transformer";

export class TagKeyDefinitionInfo extends BaseKeyDefinitionDto {

    @ApiProperty({ description: 'Tag key enum value for .c header file', required: false })
    cHeaderEnumValue!: string;

      @ApiProperty({ description: 'Values', type: [TagValueDefinitionInfo] })
      @Type(() => TagValueDefinitionInfo)
      values!: TagValueDefinitionInfo[];
}
