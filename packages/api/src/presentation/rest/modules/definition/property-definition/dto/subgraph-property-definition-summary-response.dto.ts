import { ApiProperty } from "@nestjs/swagger";
import { BasePropertyDescriptionResponseDto } from "./base-property-definition-response.dto.js";

export class SubgraphPropertyDefinitionSummaryResponseDto extends BasePropertyDescriptionResponseDto 
{
      @ApiProperty({ description: 'Indicates if the property is voice' })
      isVoice!: boolean;
}