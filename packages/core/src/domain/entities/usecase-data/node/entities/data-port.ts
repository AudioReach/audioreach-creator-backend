/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PortIoType} from '../../../common/enums/port-io-type.js';

export class DataPort {
  systemId: number;
  readonly dataPortId: number;
  readonly portIoType: PortIoType;
  readonly isStatic: boolean;
  readonly name?: string;

  constructor(params: {
    systemId: number;
    dataPortId: number;
    portIoType: PortIoType;
    isStatic: boolean;
    name?: string;
  }) {
    this.systemId = params.systemId;
    this.dataPortId = params.dataPortId;
    this.portIoType = params.portIoType;
    this.isStatic = params.isStatic;
    this.name = params.name;
  }
}
