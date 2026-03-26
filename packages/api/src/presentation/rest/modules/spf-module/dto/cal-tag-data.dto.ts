/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDetailDto} from '../../../common/dto/parameter.dto.js';

/**
 * Response DTO for calibration data API - supports multiple parameters
 */
export class CalDataResponseDto {
  @ApiProperty({
    description: 'Array of calibration data, one for each parameter',
    type: [ParameterDetailDto],
    example: [
      {
        systemId: 'SYS001',
        parameterId: '1',
        name: 'Volume Control Parameters',
        description: 'Contains all volume-related configuration parameters',
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
      {
        systemId: 'SYS001',
        parameterId: '2',
        name: 'Audio Processing Parameters',
        description: 'Contains audio processing configuration parameters',
        isHidden: false,
        isReadOnly: false,
        deprecated: false,
        isNeuralNet: false,
        isOffloaded: false,
        elements: [
          {
            type: 'ConfigElement',
            name: 'sample_rate',
            description: 'Audio sample rate setting',
            group: 'Audio Processing',
            dataType: 'UInt32',
            value: '48000',
            unit: 'Hz',
            displayType: 'DropDown',
            policy: 'Advanced',
          },
        ],
      },
    ],
  })
  data!: ParameterDetailDto[];
}

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

/**
 * Request DTO for updating tag data - supports multiple parameters
 */
export class UpdateTagDataRequestDto {
  @ApiProperty({
    description: 'Array of tag data updates for multiple parameters',
    type: [ParameterDetailDto],
    example: [
      {
        systemId: 'SYS002',
        parameterId: '1',
        name: 'Tag Volume Control Parameters',
        description:
          'Updated tag-specific volume control configuration parameters',
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
