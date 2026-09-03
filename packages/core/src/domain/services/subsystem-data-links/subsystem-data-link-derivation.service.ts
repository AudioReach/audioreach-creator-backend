/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PORT_IO_TYPE} from '../../entities/common/enums/port-io-type.js';
import type {PortIoType} from '../../entities/common/enums/port-io-type.js';

export interface SegmentDescriptor {
  sourceNodeId: number;
  destNodeId: number;
  sourceBoundaryPortType: PortIoType | null;
  destBoundaryPortType: PortIoType | null;
  position: number;
}

export interface DerivationInput {
  sourceNodeId: number;
  destNodeId: number;
  nodeParentMap: Map<number, number | null>;
}

export const SubsystemDataLinkDerivationService = {
  /**
   * Computes the ordered list of SLS segments for a data link crossing
   * subsystem boundaries. Returns [] if source and dest share the same
   * subsystem context (no boundary crossing needed).
   *
   * Each segment describes one hop in the chain: which nodes it connects and
   * the PortIoType required at each end (null = module endpoint, not a
   * boundary port).
   */
  compute(input: DerivationInput): SegmentDescriptor[] {
    const {sourceNodeId, destNodeId, nodeParentMap} = input;

    // Build exit chain: ancestors of source (innermost first)
    const exitChain: number[] = [];
    let cursor: number | null = nodeParentMap.get(sourceNodeId) ?? null;
    while (cursor !== null) {
      exitChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Build entry chain: ancestors of dest (innermost first)
    const entryChain: number[] = [];
    cursor = nodeParentMap.get(destNodeId) ?? null;
    while (cursor !== null) {
      entryChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Find LCA — first node in exitChain that also appears in entryChain
    const entrySet = new Set(entryChain);
    let lca: number | null = null;
    for (const node of exitChain) {
      if (entrySet.has(node)) {
        lca = node;
        break;
      }
    }

    // Trim both chains at LCA (exclusive — LCA itself is not a boundary node)
    const trimmedExit =
      lca === null ? exitChain : exitChain.slice(0, exitChain.indexOf(lca));
    const trimmedEntry =
      lca === null ? entryChain : entryChain.slice(0, entryChain.indexOf(lca));
    const reversedEntry = trimmedEntry.toReversed();

    const nodeSequence = [
      sourceNodeId,
      ...trimmedExit,
      ...reversedEntry,
      destNodeId,
    ];

    // No boundary crossing if source and dest are in the same context
    if (nodeSequence.length <= 2) return [];

    // Assign required port types: exit nodes → OutputInput, entry nodes → InputOutput
    const requiredPortType = new Map<number, PortIoType>();
    for (const n of trimmedExit)
      requiredPortType.set(n, PORT_IO_TYPE.OutputInput);
    for (const n of reversedEntry)
      requiredPortType.set(n, PORT_IO_TYPE.InputOutput);

    const segments: SegmentDescriptor[] = [];
    for (let i = 0; i < nodeSequence.length - 1; i++) {
      segments.push({
        sourceNodeId: nodeSequence[i],
        destNodeId: nodeSequence[i + 1],
        sourceBoundaryPortType:
          i === 0 ? null : (requiredPortType.get(nodeSequence[i]) ?? null),
        destBoundaryPortType:
          i === nodeSequence.length - 2
            ? null
            : (requiredPortType.get(nodeSequence[i + 1]) ?? null),
        position: i,
      });
    }
    return segments;
  },
} as const;
