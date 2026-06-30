/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PORT_IO_TYPE} from '../../entities/common/enums/port-io-type.js';

// ---------------------------------------------------------------------------
// Interfaces (exported — callers depend on these shapes)
// ---------------------------------------------------------------------------

export interface PathInput {
  /** node.system_id for the source module */
  sourceNodeId: number;
  /** node.system_id for the dest module */
  destNodeId: number;
  /** All nodes visible in the file: maps node.system_id → node.parentId (null = top level) */
  nodeParentMap: Map<number, number | null>;
}

export interface PathOutput {
  /** Ordered node IDs: [sourceModule, ...subsystemNodes, destModule] */
  nodeSequence: number[];
  /**
   * For each subsystem node in nodeSequence: the PortIoType it must have.
   * EXIT nodes (signal leaves) → PORT_IO_TYPE.OutputInput
   * ENTRY nodes (signal enters) → PORT_IO_TYPE.InputOutput
   */
  requiredPortType: Map<
    number,
    typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
  >;
}

// ---------------------------------------------------------------------------
// Service (static methods only — pure function, no instantiation needed)
// ---------------------------------------------------------------------------

export const SubsystemBoundaryPathService = {
  /**
   * Given two module nodes in different subsystem contexts, computes the
   * ordered node sequence the signal must pass through and the PortIoType
   * required at each subsystem boundary.
   *
   * Algorithm (spec section 5.1 / OQ-2):
   * 1. Walk nodeParentMap upward from sourceNodeId → exitChain
   * 2. Walk nodeParentMap upward from destNodeId   → entryChain
   * 3. Find LCA — first entry shared by both chains (null = top level if none)
   * 4. Trim both chains at LCA (exclusive)
   * 5. Reverse entryChain (LCA-level down to dest's immediate parent)
   * 6. Assemble nodeSequence
   * 7. Assign requiredPortType per chain membership
   */
  compute(input: PathInput): PathOutput {
    const {sourceNodeId, destNodeId, nodeParentMap} = input;

    // Step 1: build exitChain (ancestors of source, innermost first)
    const exitChain: number[] = [];
    let cursor: number | null = nodeParentMap.get(sourceNodeId) ?? null;
    while (cursor !== null) {
      exitChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Step 2: build entryChain (ancestors of dest, innermost first)
    const entryChain: number[] = [];
    cursor = nodeParentMap.get(destNodeId) ?? null;
    while (cursor !== null) {
      entryChain.push(cursor);
      cursor = nodeParentMap.get(cursor) ?? null;
    }

    // Step 3: find LCA — first node in exitChain that also appears in entryChain
    // A null LCA means the two chains share no common ancestor (both reach top level
    // without meeting), or one/both chains are empty (module already at top level).
    const entryChainSet = new Set<number>(entryChain);
    let lca: number | null = null;
    for (const node of exitChain) {
      if (entryChainSet.has(node)) {
        lca = node;
        break;
      }
    }

    // Step 4: trim both chains at LCA (exclusive — LCA itself is not a boundary node)
    const trimmedExit =
      lca === null ? exitChain : exitChain.slice(0, exitChain.indexOf(lca));

    const trimmedEntry =
      lca === null ? entryChain : entryChain.slice(0, entryChain.indexOf(lca));

    const reversedEntry = trimmedEntry.toReversed();

    // Step 6: assemble nodeSequence
    const nodeSequence: number[] = [
      sourceNodeId,
      ...trimmedExit,
      ...reversedEntry,
      destNodeId,
    ];

    // Step 7: assign requiredPortType
    const requiredPortType = new Map<
      number,
      typeof PORT_IO_TYPE.OutputInput | typeof PORT_IO_TYPE.InputOutput
    >();

    for (const node of trimmedExit) {
      requiredPortType.set(node, PORT_IO_TYPE.OutputInput);
    }
    for (const node of reversedEntry) {
      requiredPortType.set(node, PORT_IO_TYPE.InputOutput);
    }

    return {nodeSequence, requiredPortType};
  },
} as const;
