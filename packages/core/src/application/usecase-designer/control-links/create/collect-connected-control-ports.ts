/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type ControlPortEdge = {
  readonly nodeAPortSystemId: number;
  readonly nodeBPortSystemId: number;
};

/** Returns every port in the connected control-link component. */
export function collectConnectedControlPorts(
  edges: readonly ControlPortEdge[],
  seedPortSystemIds: readonly number[],
): ReadonlySet<number> {
  const reachable = new Set(seedPortSystemIds);
  const queue = [...seedPortSystemIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      const peer =
        edge.nodeAPortSystemId === current
          ? edge.nodeBPortSystemId
          : edge.nodeBPortSystemId === current
            ? edge.nodeAPortSystemId
            : undefined;
      if (peer !== undefined && !reachable.has(peer)) {
        reachable.add(peer);
        queue.push(peer);
      }
    }
  }

  return reachable;
}
