/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {ControlLinkType} from '../../../../domain/entities/usecase-data/links/control-link-type.js';
import type {SegmentDescriptor} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

export async function buildControlTraversalEntities(
  segments: SegmentDescriptor[],
  sourcePortSystemId: number,
  destinationPortSystemId: number,
  controlLinkSystemId: number,
  linkType: ControlLinkType,
  fileSystemId: number,
  idGeneration: IdGenerationPort,
  naturalIdStarts: ReadonlyMap<number, number> = new Map(),
): Promise<{
  controlPorts: ControlPort[];
  subsystemControlLinks: SubsystemControlLink[];
}> {
  const controlPorts: ControlPort[] = [];
  const subsystemControlLinks: SubsystemControlLink[] = [];
  const portByNode = new Map<number, number>();
  const nextNaturalIdByNode = new Map<number, number>();

  const allocate = async (nodeSystemId: number): Promise<number> => {
    const existing = portByNode.get(nodeSystemId);
    if (existing !== undefined) return existing;
    const systemId = await idGeneration.getNextId(fileSystemId);
    const naturalId =
      (nextNaturalIdByNode.get(nodeSystemId) ??
        naturalIdStarts.get(nodeSystemId) ??
        0) + 1;
    nextNaturalIdByNode.set(nodeSystemId, naturalId);
    portByNode.set(nodeSystemId, systemId);
    controlPorts.push(
      new ControlPort({
        systemId,
        naturalId,
        name: '',
        isStatic: false,
        nodeSystemId,
        intentSystemIds: [],
      }),
    );
    return systemId;
  };

  for (const segment of segments) {
    if (segment.sourceBoundaryPortType !== null)
      await allocate(segment.sourceNodeSystemId);
    if (segment.destBoundaryPortType !== null)
      await allocate(segment.destinationNodeSystemId);
  }

  for (const segment of segments) {
    const sourcePort =
      segment.sourceBoundaryPortType === null
        ? sourcePortSystemId
        : portByNode.get(segment.sourceNodeSystemId)!;
    const destinationPort =
      segment.destBoundaryPortType === null
        ? destinationPortSystemId
        : portByNode.get(segment.destinationNodeSystemId)!;
    subsystemControlLinks.push(
      new SubsystemControlLink(
        await idGeneration.getNextId(fileSystemId),
        segment.sourceNodeSystemId,
        segment.destinationNodeSystemId,
        sourcePort,
        destinationPort,
        controlLinkSystemId,
        fileSystemId,
        linkType,
        0,
      ),
    );
  }
  return {controlPorts, subsystemControlLinks};
}
