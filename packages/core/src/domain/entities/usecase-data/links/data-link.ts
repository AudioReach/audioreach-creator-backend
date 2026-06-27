/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LinkType} from './link-type.js';
import type {SubsystemDataLink} from './subsystem-data-link.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface DataLinkInit {
  systemId: number;
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  linkType: LinkType;
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
  fileSystemId: number;
  isEc?: boolean;
  subsystemDataLinks?: SubsystemDataLink[];
}

export class DataLink {
  systemId: number;
  readonly sourceNodeSystemId: number;
  readonly destinationNodeSystemId: number;
  readonly sourcePortSystemId: number;
  readonly destinationPortSystemId: number;
  readonly linkType: LinkType;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
  readonly isEc?: boolean;
  readonly fileSystemId: number;
  readonly subsystemDataLinks: SubsystemDataLink[] = [];

  private readonly slsSystemIds = new Set<number>();
  private readonly slsPortPairs = new Set<string>();

  constructor(initParam: DataLinkInit) {
    this.systemId = initParam.systemId;
    this.sourceNodeSystemId = initParam.sourceNodeSystemId;
    this.destinationNodeSystemId = initParam.destinationNodeSystemId;
    this.sourcePortSystemId = initParam.sourcePortSystemId;
    this.destinationPortSystemId = initParam.destinationPortSystemId;
    this.linkType = initParam.linkType;
    this.sourceSubgraphSystemId = initParam.sourceSubgraphSystemId;
    this.destSubgraphSystemId = initParam.destSubgraphSystemId;
    this.fileSystemId = initParam.fileSystemId;
    this.isEc = initParam.isEc;
    invariant(
      initParam.sourceNodeSystemId !== initParam.destinationNodeSystemId,
      `DataLink cannot connect a node to itself: ${BinaryUtils.toHexString(initParam.sourceNodeSystemId)}`,
    );
    for (const sls of initParam.subsystemDataLinks ?? []) {
      this.addSubsystemDataLink(sls);
    }
  }

  private addSubsystemDataLink(sls: SubsystemDataLink): void {
    assertNonNull(
      sls,
      `subsystemDataLink is null for DataLink: ${BinaryUtils.toHexString(this.systemId)}`,
    );
    invariant(
      !this.slsSystemIds.has(sls.systemId),
      `SubsystemDataLink systemId ${sls.systemId} is duplicated in DataLink: ${BinaryUtils.toHexString(this.systemId)}`,
    );
    const portPairKey = `${sls.sourcePortSystemId}:${sls.destinationPortSystemId}`;
    invariant(
      !this.slsPortPairs.has(portPairKey),
      `SubsystemDataLink port pair (${BinaryUtils.toHexString(sls.sourcePortSystemId)}, ${BinaryUtils.toHexString(sls.destinationPortSystemId)}) already exists in DataLink: ${BinaryUtils.toHexString(this.systemId)}`,
    );
    this.slsSystemIds.add(sls.systemId);
    this.slsPortPairs.add(portPairKey);
    this.subsystemDataLinks.push(sls);
  }
}
