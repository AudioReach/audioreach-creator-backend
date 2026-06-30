/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface SubsystemDataLinkInit {
  systemId: number;
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  dataLinkSystemId: number | null;
  fileSystemId: number;
}

export class SubsystemDataLink {
  readonly systemId: number;
  readonly sourceNodeSystemId: number;
  readonly destinationNodeSystemId: number;
  readonly sourcePortSystemId: number;
  readonly destinationPortSystemId: number;
  readonly dataLinkSystemId: number | null;
  readonly fileSystemId: number;

  constructor(initParam: SubsystemDataLinkInit) {
    this.systemId = initParam.systemId;
    this.sourceNodeSystemId = initParam.sourceNodeSystemId;
    this.destinationNodeSystemId = initParam.destinationNodeSystemId;
    this.sourcePortSystemId = initParam.sourcePortSystemId;
    this.destinationPortSystemId = initParam.destinationPortSystemId;
    this.dataLinkSystemId = initParam.dataLinkSystemId;
    this.fileSystemId = initParam.fileSystemId;
    invariant(
      initParam.sourceNodeSystemId !== initParam.destinationNodeSystemId,
      `SubsystemDataLink segment cannot have the same source and destination node: ${BinaryUtils.toHexString(initParam.sourceNodeSystemId)}`,
    );
  }
}
