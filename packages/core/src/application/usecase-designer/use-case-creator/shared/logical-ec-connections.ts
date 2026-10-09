/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';

export interface LogicalEcConnection {
  /** Stable correlation key: the first physical EC link in the directed chain. */
  readonly representativeDataLinkSystemId: number;
  /** Non-MDF endpoint where EC-aware DFS emits the Left boundary path. */
  readonly leftSubgraphSystemId: number;
  /** Non-MDF endpoint where EC-aware DFS starts the independent Right traversal. */
  readonly rightSubgraphSystemId: number;
  /** Ordered physical SG path, including all pass-through MDF members. */
  readonly subgraphSystemIds: readonly number[];
  /** Ordered physical EC links collapsed into this logical edge. */
  readonly dataLinkSystemIds: readonly number[];
}

function bySystemId(left: DataLink, right: DataLink): number {
  return left.systemId - right.systemId;
}

/**
 * Collapses each non-branching EC chain through MDF-only interior subgraphs into one
 * logical connection. Invalid shapes stay split so callers can reject multiple logical
 * crossings rather than accidentally normalizing a branch or cycle.
 */
export function logicalEcConnections(
  dataLinks: readonly DataLink[],
  mdfSubgraphSystemIds: ReadonlySet<number>,
): readonly LogicalEcConnection[] {
  const ecLinks = dataLinks
    .filter(link => link.linkType === DATA_LINK_TYPE.Ec)
    .sort(bySystemId);
  const incoming = new Map<number, DataLink[]>();
  const outgoing = new Map<number, DataLink[]>();
  for (const link of ecLinks) {
    const incomingLinks = incoming.get(link.destSubgraphSystemId) ?? [];
    incomingLinks.push(link);
    incoming.set(link.destSubgraphSystemId, incomingLinks);
    const outgoingLinks = outgoing.get(link.sourceSubgraphSystemId) ?? [];
    outgoingLinks.push(link);
    outgoing.set(link.sourceSubgraphSystemId, outgoingLinks);
  }
  for (const links of incoming.values()) links.sort(bySystemId);
  for (const links of outgoing.values()) links.sort(bySystemId);

  const assignedLinkIds = new Set<number>();
  const connections: LogicalEcConnection[] = [];

  // Start only at a logical boundary, never in the middle of a valid MDF chain. A
  // non-MDF source is always a logical endpoint. An MDF source is an interior node
  // only when it has exactly one incoming and one outgoing EC link; any other degree
  // indicates an endpoint or invalid branch, so its outgoing links must start their
  // own connections and remain visible to Rule C / EC-05 validation.
  const starts = ecLinks.filter(link => {
    if (!mdfSubgraphSystemIds.has(link.sourceSubgraphSystemId)) return true;
    return (
      (incoming.get(link.sourceSubgraphSystemId)?.length ?? 0) !== 1 ||
      (outgoing.get(link.sourceSubgraphSystemId)?.length ?? 0) !== 1
    );
  });

  // This helper is intentionally local: it mutates the algorithm-local assigned-ID
  // set and output collection and reads the prebuilt adjacency maps. Keeping it as a
  // closure avoids exposing or threading that five-part traversal state elsewhere.
  const appendConnection = (firstLink: DataLink): void => {
    if (assignedLinkIds.has(firstLink.systemId)) return;
    const connectionLinks = [firstLink];
    assignedLinkIds.add(firstLink.systemId);
    let rightSubgraphSystemId = firstLink.destSubgraphSystemId;
    let closedCycle = false;
    while (mdfSubgraphSystemIds.has(rightSubgraphSystemId)) {
      const incomingLinks = incoming.get(rightSubgraphSystemId) ?? [];
      const outgoingLinks = outgoing.get(rightSubgraphSystemId) ?? [];
      // Only a 1-in/1-out MDF node is transparent. Stop before a branch or merge so
      // the ambiguous links become separate logical connections and are rejected.
      if (incomingLinks.length !== 1 || outgoingLinks.length !== 1) break;
      const nextLink = outgoingLinks[0];
      if (assignedLinkIds.has(nextLink.systemId)) {
        closedCycle = true;
        break;
      }
      connectionLinks.push(nextLink);
      assignedLinkIds.add(nextLink.systemId);
      rightSubgraphSystemId = nextLink.destSubgraphSystemId;
    }
    if (closedCycle) {
      connections.push(
        ...connectionLinks.map(link => ({
          representativeDataLinkSystemId: link.systemId,
          leftSubgraphSystemId: link.sourceSubgraphSystemId,
          rightSubgraphSystemId: link.destSubgraphSystemId,
          subgraphSystemIds: [
            link.sourceSubgraphSystemId,
            link.destSubgraphSystemId,
          ],
          dataLinkSystemIds: [link.systemId],
        })),
      );
      return;
    }
    connections.push({
      representativeDataLinkSystemId: firstLink.systemId,
      leftSubgraphSystemId: firstLink.sourceSubgraphSystemId,
      rightSubgraphSystemId,
      subgraphSystemIds: [
        firstLink.sourceSubgraphSystemId,
        ...connectionLinks.map(link => link.destSubgraphSystemId),
      ],
      dataLinkSystemIds: connectionLinks.map(link => link.systemId),
    });
  };

  for (const start of starts) appendConnection(start);
  // A closed MDF EC cycle has no start. Keeping each remaining edge separate makes the
  // invalid shape visible to Rule C and the single-EC-per-path check.
  for (const link of ecLinks) appendConnection(link);
  return connections.sort(
    (left, right) =>
      left.representativeDataLinkSystemId -
        right.representativeDataLinkSystemId ||
      left.leftSubgraphSystemId - right.leftSubgraphSystemId ||
      left.rightSubgraphSystemId - right.rightSubgraphSystemId,
  );
}
