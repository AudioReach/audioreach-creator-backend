/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {BoundaryPortPayload} from '../../../ports/persistence/repositories/data-link/data-link.repository.js';
import {SubsystemDataLink} from '../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {SegmentDescriptor} from '../../../../domain/services/subsystem-data-links/subsystem-data-link-derivation.service.js';

/**
 * Given the segment descriptors from SubsystemDataLinkDerivationService,
 * allocates system IDs for boundary ports and SLS segments, then returns
 * both arrays ready for persistence via DataLinkRepository.createDataLink.
 *
 * nodeParentMap is required to populate BoundaryPortPayload.nodeParentId
 * (used by the TypeORM repository when writing boundary port Node rows).
 * SegmentDescriptor does not carry nodeParentId itself, so the caller must
 * pass the same map it already loaded for the derivation service call.
 */
export async function buildTraversalEntities(
  segments: SegmentDescriptor[],
  srcPortId: number,
  dstPortId: number,
  dataLinkSystemId: number,
  fileSystemId: number,
  idGeneration: IdGenerationPort,
  nodeParentMap: Map<number, number | null>,
): Promise<{
  boundaryPortPayloads: BoundaryPortPayload[];
  slsSegments: SubsystemDataLink[];
}> {
  const boundaryPortPayloads: BoundaryPortPayload[] = [];
  const slsSegments: SubsystemDataLink[] = [];

  if (segments.length === 0) {
    return {boundaryPortPayloads, slsSegments};
  }

  // Allocate one port per subsystem boundary node. A node may appear as both
  // dest of one segment and source of the next — deduplicate by checking portMap.
  const portMap = new Map<number, number>();

  for (const seg of segments) {
    if (seg.sourceBoundaryPortType !== null && !portMap.has(seg.sourceNodeId)) {
      const portSystemId = await idGeneration.getNextId(fileSystemId);
      portMap.set(seg.sourceNodeId, portSystemId);
      boundaryPortPayloads.push({
        portSystemId,
        nodeSystemId: seg.sourceNodeId,
        nodeParentId: nodeParentMap.get(seg.sourceNodeId) ?? null,
        portIoType: seg.sourceBoundaryPortType,
        dataPortId: portSystemId,
        fileSystemId,
      });
    }
    if (seg.destBoundaryPortType !== null && !portMap.has(seg.destNodeId)) {
      const portSystemId = await idGeneration.getNextId(fileSystemId);
      portMap.set(seg.destNodeId, portSystemId);
      boundaryPortPayloads.push({
        portSystemId,
        nodeSystemId: seg.destNodeId,
        nodeParentId: nodeParentMap.get(seg.destNodeId) ?? null,
        portIoType: seg.destBoundaryPortType,
        dataPortId: portSystemId,
        fileSystemId,
      });
    }
  }

  for (const seg of segments) {
    const segSrcPort =
      seg.sourceBoundaryPortType === null
        ? srcPortId
        : portMap.get(seg.sourceNodeId)!;
    const segDstPort =
      seg.destBoundaryPortType === null
        ? dstPortId
        : portMap.get(seg.destNodeId)!;
    const slsId = await idGeneration.getNextId(fileSystemId);
    slsSegments.push(
      new SubsystemDataLink({
        systemId: slsId,
        sourceNodeSystemId: seg.sourceNodeId,
        destinationNodeSystemId: seg.destNodeId,
        sourcePortSystemId: segSrcPort,
        destinationPortSystemId: segDstPort,
        dataLinkSystemId,
        fileSystemId,
      }),
    );
  }

  return {boundaryPortPayloads, slsSegments};
}
