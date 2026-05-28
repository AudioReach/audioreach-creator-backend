/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SameNodeException} from './exceptions.js';
import type {LinkType} from './link-type.js';

export class DataLink {
  public systemId: number;
  public sourceNodeSystemId: number;
  public destinationNodeSystemId: number;
  public sourcePortSystemId: number;
  public destinationPortSystemId: number;
  public linkType: LinkType;
  public sourceSubgraphSystemId: number;
  public destSubgraphSystemId: number;
  public isEc?: boolean;
  public fileSystemId: number;

  constructor(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    linkType: LinkType,
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
    fileSystemId: number,
    isEc?: boolean,
  ) {
    this.systemId = systemId;
    this.sourceNodeSystemId = sourceNodeSystemId;
    this.destinationNodeSystemId = destinationNodeSystemId;
    this.sourcePortSystemId = sourcePortSystemId;
    this.destinationPortSystemId = destinationPortSystemId;
    this.linkType = linkType;
    this.sourceSubgraphSystemId = sourceSubgraphSystemId;
    this.destSubgraphSystemId = destSubgraphSystemId;
    this.fileSystemId = fileSystemId;
    this.isEc = isEc;
    if (this.sourceNodeSystemId == this.destinationNodeSystemId) {
      throw new SameNodeException(sourceNodeSystemId);
    }
  }
}
