/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDetailDto} from '../../../common/dto/parameter.dto.js';

/**
 * Request DTO for updating calibration data - supports multiple parameters
 */
export class UpdateCalDataRequestDto {
  @ApiProperty({
    description: 'Array of calibration data updates for multiple parameters',
    type: [ParameterDetailDto],
    example: [
      {
        systemId: 'SYS001',
        parameterId: '1',
        name: 'Volume Control Parameters',
        description: 'Updated volume-related configuration parameters',
        isHidden: false,
        isReadOnly: false,
        deprecated: false,
        isNeuralNet: false,
        isOffloaded: false,
        elements: [
          {
            type: 'ConfigElement',
            name: 'volume_level',
            description: 'Audio volume level setting',
            group: 'Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '80',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '20', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '80', name: 'High'},
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
