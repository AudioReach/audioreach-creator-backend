/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {DataLinkDto} from '../../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../control-link/dto/control-link.dto.js';

export class SubgraphPairDto {
  @ApiProperty({description: 'Source subgraph system ID'})
  sourceSubgraphSystemId!: string;

  @ApiProperty({description: 'Destination subgraph system ID'})
  destinationSubgraphSystemId!: string;

  @ApiProperty({
    description: 'Data links between the subgraph pair',
    type: [DataLinkDto],
  })
  dataLinks!: DataLinkDto[];

  @ApiProperty({
    description: 'Control links between the subgraph pair',
    type: [ControlLinkDto],
  })
  controlLinks!: ControlLinkDto[];
}
