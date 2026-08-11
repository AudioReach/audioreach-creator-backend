/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubsystemDto} from '../../../modules/subsystem/dto/subsystem.dto.js';
import {KeyInfoResponseDto} from '../../dto/kv-info-response.dto.js';

export const subsystemApiExample = new SubsystemDto(
  '1',
  0xf0_10_00_01,
  'Device_RX',
  undefined,
);

subsystemApiExample.filteredKeys = [
  Object.assign(new KeyInfoResponseDto(), {
    keyId: 0xa2_00_00_00,
    keyLabel: 'DeviceRX',
    keySystemId: '1',
  }),
];
