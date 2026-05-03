/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SameNodeException} from './exceptions.js';

export class DataLink {
  public systemId: number;
  public sourceNodeSystemId: number;
  public destinationNodeSystemId: number;
  public sourcePortSystemId: number;
  public destinationPortSystemId: number;
  public isInterGraph: boolean;
  public fileSystemId: number;

  constructor(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    isInterGraph: boolean,
    fileSystemId: number,
  ) {
    this.systemId = systemId;
    this.sourceNodeSystemId = sourceNodeSystemId;
    this.destinationNodeSystemId = destinationNodeSystemId;
    this.sourcePortSystemId = sourcePortSystemId;
    this.destinationPortSystemId = destinationPortSystemId;
    this.isInterGraph = isInterGraph;
    this.fileSystemId = fileSystemId;
    if (this.sourceNodeSystemId == this.destinationNodeSystemId) {
      throw new SameNodeException(sourceNodeSystemId);
    }
  }
}
