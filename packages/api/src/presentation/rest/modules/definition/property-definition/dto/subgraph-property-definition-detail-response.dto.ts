import { ApiProperty } from "@nestjs/swagger";
import { SubgraphPropertyDefinitionSummaryResponseDto } from "./subgraph-property-definition-summary-response.dto.js";

export class SubgraphPropertyDefinitionDetailResponseDto extends SubgraphPropertyDefinitionSummaryResponseDto 
{
  @ApiProperty({ description: 'Property structure elements', type: 'array', items: { type: 'object' } })
  elements!: any[];
}