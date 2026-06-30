/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SameNodeException} from './exceptions.js';
import type {LinkType} from './link-type.js';
import type {SubsystemControlLink} from './subsystem-control-link.js';

export class ControlLink {
  public systemId: number;
  public fileSystemId: number;
  public peerNodeASystemId: number;
  public peerNodeBSystemId: number;
  public nodeAPortSystemId: number;
  public nodeBPortSystemId: number;
  public heapId: number;
  public linkType: LinkType;
  public sourceSubgraphSystemId: number;
  public destSubgraphSystemId: number;
  public subsystemControlLinks: SubsystemControlLink[];

  constructor(
    systemId: number,
    fileSystemId: number,
    peerNodeASystemId: number,
    peerNodeBSystemId: number,
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    heapId: number,
    linkType: LinkType,
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
    subsystemControlLinks: SubsystemControlLink[] = [],
  ) {
    this.systemId = systemId;
    this.fileSystemId = fileSystemId;
    this.peerNodeASystemId = peerNodeASystemId;
    this.peerNodeBSystemId = peerNodeBSystemId;
    this.nodeAPortSystemId = nodeAPortSystemId;
    this.nodeBPortSystemId = nodeBPortSystemId;
    this.heapId = heapId;
    this.linkType = linkType;
    this.sourceSubgraphSystemId = sourceSubgraphSystemId;
    this.destSubgraphSystemId = destSubgraphSystemId;
    this.subsystemControlLinks = subsystemControlLinks;
    if (this.peerNodeASystemId == this.peerNodeBSystemId) {
      throw new SameNodeException(peerNodeASystemId);
    }
  }
}
