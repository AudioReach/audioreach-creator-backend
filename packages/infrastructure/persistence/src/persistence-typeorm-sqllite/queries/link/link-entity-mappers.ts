/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ControlLink,
  DataLink,
  SubsystemControlLink,
  SubsystemDataLink,
} from '@arc/core';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {
  EffectiveSubsystemControlLinkRow,
  EffectiveSubsystemDataLinkRow,
} from '../../fetchers/link-overlay-fetcher.js';

/**
 * Maps overlaid link rows to domain entities. Shared by the link query
 * services, which return entities to commands, and the link repositories.
 */

export function toSubsystemDataLink(
  r: EffectiveSubsystemDataLinkRow,
): SubsystemDataLink {
  return new SubsystemDataLink({
    systemId: r.systemId,
    sourceNodeSystemId: r.sourceNodeSystemId,
    destinationNodeSystemId: r.destinationNodeSystemId,
    sourcePortSystemId: r.sourcePortSystemId,
    destinationPortSystemId: r.destinationPortSystemId,
    dataLinkSystemId: r.dataLinkSystemId,
    fileSystemId: r.fileSystemId,
    linkType: r.linkType,
  });
}

export function toDataLink(
  r: DataLinkBase,
  subsystemDataLinks: SubsystemDataLink[] = [],
): DataLink {
  return new DataLink({
    systemId: r.systemId,
    sourceNodeSystemId: r.sourceNodeSystemId,
    destinationNodeSystemId: r.destinationNodeSystemId,
    sourcePortSystemId: r.sourcePortSystemId,
    destinationPortSystemId: r.destinationPortSystemId,
    linkType: r.linkType,
    sourceSubgraphSystemId: r.sourceSubgraphSystemId,
    destSubgraphSystemId: r.destSubgraphSystemId,
    fileSystemId: r.fileSystemId,
    subsystemDataLinks,
  });
}

export function toSubsystemControlLink(
  r: EffectiveSubsystemControlLinkRow,
): SubsystemControlLink {
  return new SubsystemControlLink(
    r.systemId,
    r.peerNodeASystemId,
    r.peerNodeBSystemId,
    r.nodeAPortSystemId,
    r.nodeBPortSystemId,
    r.controlLinkSystemId,
    r.fileSystemId,
    r.linkType,
    r.version,
  );
}

export function toControlLink(
  r: ControlLinkBase,
  subsystemControlLinks: SubsystemControlLink[] = [],
): ControlLink {
  return new ControlLink(
    r.systemId,
    r.fileSystemId,
    r.peerNodeASystemId,
    r.peerNodeBSystemId,
    r.nodeAPortSystemId,
    r.nodeBPortSystemId,
    r.heapId,
    r.linkType,
    r.sourceSubgraphSystemId,
    r.destSubgraphSystemId,
    subsystemControlLinks,
  );
}
