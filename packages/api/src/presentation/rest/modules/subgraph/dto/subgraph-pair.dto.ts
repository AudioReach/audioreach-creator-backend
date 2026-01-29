/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataLinkDto} from '../../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../control-link/dto/control-link.dto.js';

export class SubgraphPairDto {
  sourceSubgraphId!: number;
  destinationSubgraphId!: number;
  dataLinks!: DataLinkDto[];
  controlLinks!: ControlLinkDto[];
}
