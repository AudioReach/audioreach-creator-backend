/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDetailDto} from '../parameter.dto.js';

/**
 * Response DTO for tag data API - supports multiple parameters with tag context
 */
export class TkvDataDto {
  @ApiProperty({
    description: 'Array of parameter data for this tag',
    type: [ParameterDetailDto],
    example: [
      {
        systemId: 'SYS002',
        parameterId: '1',
        name: 'Tag Volume Control Parameters',
        description: 'Tag-specific volume control configuration parameters',
        isHidden: false,
        isReadOnly: false,
        deprecated: false,
        isNeuralNet: false,
        isOffloaded: false,
        elements: [
          {
            type: 'ConfigElement',
            name: 'tag_volume_level',
            description: 'Tag-specific volume level setting',
            group: 'Tag Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '75',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '25', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '75', name: 'High'},
              {value: '100', name: 'Maximum'},
            ],
            isReadOnly: false,
          },
        ],
      },
    ],
  })
  data!: ParameterDetailDto[];
}
