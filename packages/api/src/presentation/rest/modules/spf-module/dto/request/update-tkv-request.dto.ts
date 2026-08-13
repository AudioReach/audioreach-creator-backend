/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterSummaryDto} from '../../../../common/dto/parameter-summary.dto.js';

export class UpdateTkvRequestDto {
  @ApiProperty({
    description: 'Array of parameter data to write, one entry per PID.',
    type: [ParameterSummaryDto],
  })
  data!: ParameterSummaryDto[];
}
