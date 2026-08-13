/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SubsystemResponseDto} from '../../../modules/subsystem/dto/subsystem.dto.js';
import {type KeyInfoDto} from '@arc/core';

export const subsystemApiExample = Object.assign(new SubsystemResponseDto(), {
  systemId: '1',
  id: 0xf0_10_00_01,
  name: 'Device_RX',
  parentId: undefined,
  dataPorts: [],
  controlPorts: [],
  filteredKeys: [
    {
      keyId: 0xa2_00_00_00,
      name: 'DeviceRX',
      systemId: '1',
    } satisfies KeyInfoDto,
  ],
  relatedEndPointLinks: [],
});
