import {ApiProperty} from '@nestjs/swagger';
import {ParameterDefinitionSummaryInfo} from './parameter-definition-summary-info.js';

export class ParameterDefinitionDetailInfo extends ParameterDefinitionSummaryInfo {
  @ApiProperty({
    description: 'Parameter structure elements',
    type: 'array',
    items: {type: 'object'},
  })
  elements!: any[];
}
