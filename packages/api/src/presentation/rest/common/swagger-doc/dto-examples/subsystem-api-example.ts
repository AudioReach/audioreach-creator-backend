/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubsystemDto} from '../../../modules/subsystem/dto/subsystem.dto.js';
import {KeyInfo} from '../../dto/kv.dto.js';

export const subsystemApiExample = new SubsystemDto(
  '1',
  0xf0_10_00_01,
  'Device_RX',
  undefined,
);

subsystemApiExample.filteredKeys = [
  new KeyInfo(0xa2_00_00_00, 'DeviceRX', '1'),
];
