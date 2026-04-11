/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PortIoType} from '../../../common/enums/port-io-type.js';
import {DataPortDefinition} from './data-port-definition.js';
import {invariant} from '../../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

export interface DataPortGroupDefinitionInit {
  maxAllowedPortCount: number;
  portIoType: PortIoType;
  staticPortDefinitions: DataPortDefinition[];
}

export class DataPortGroupDefinition {
  maxAllowedPortCount: number;
  portIoType: PortIoType;
  readonly staticPortDefinitions: DataPortDefinition[] = [];

  constructor(initParam: DataPortGroupDefinitionInit) {
    this.maxAllowedPortCount = initParam.maxAllowedPortCount;
    this.portIoType = initParam.portIoType;
    this.staticPortDefinitions = initParam.staticPortDefinitions;
    this.checkInvariants();
  }

  checkInvariants() {
    const seen = new Set<number>();
    for (const port of this.staticPortDefinitions) {
      invariant(
        !seen.has(port.dataPortId),
        `Duplicate dataPortId: ${BinaryUtils.toHexString(port.dataPortId)}`,
      );
      seen.add(port.dataPortId);
    }
  }
}
