<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: `ControlChainResolutionService` (§11.9)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.9 (lines 1019–1065).
>
> **Goal of this chapter:** Add a new pure-domain service to `@arc/core` that, given the full set of unresolved Control Subsystem Link Segments (CSLS) for a file, finds every complete undirected path between two module nodes and returns the canonical information needed to create a `ControlLink` for each. The service is the control-plane analogue of the existing `ChainResolutionService` for data links, with one key shape difference: control chains are **undirected** (a CSLS connects two peer nodes / two peer ports — no source vs destination), and the resolver must canonicalise endpoints by ordering `peerAPortSystemId < peerBPortSystemId` so the same chain produces the same result regardless of which terminus the DFS is rooted at.
>
> **Cardinal rule check:** the service lives in `packages/core/src/domain/services/control-links/` and depends only on the existing `NodeType` enum from `packages/core/src/domain/entities/usecase-data/node/node.js`. No NestJS, no TypeORM, no Node.js APIs. Pure TypeScript, unit-tested without mocks.

---

### Task 9: Write the failing unit-test suite for `ControlChainResolutionService`

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/control-links/control-chain-resolution.service.spec.ts` (new)

- [ ] **Step 1: Create the test file**

  Create `packages/core/tests/unit/domain/services/control-links/control-chain-resolution.service.spec.ts`. Tests are ordered from the simplest case to the most complex so the implementation can be driven in TDD style: empty input, single complete chain, multiple independent chains, incomplete chain at a dead end, cycle detection, fan-out, and reverse-direction equivalence. Every `it()` uses concrete `systemId` / port numbers (no `expect.any(...)` and no "behavioural" asserts) so the implementation has a hard target to hit.

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {
    ControlChainResolutionService,
    type ControlResolutionInput,
    type ControlResolutionResult,
  } from '../../../../../src/domain/services/control-links/control-chain-resolution.service.js';
  import {NodeType} from '../../../../../src/domain/entities/usecase-data/node/node.js';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  type SegmentShape = ControlResolutionInput['unresolvedSegments'][number];

  function seg(
    systemId: number,
    peerNodeASystemId: number,
    peerNodeBSystemId: number,
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
  ): SegmentShape {
    return {
      systemId,
      peerNodeASystemId,
      peerNodeBSystemId,
      nodeAPortSystemId,
      nodeBPortSystemId,
    };
  }

  function nodeTypeMap(
    entries: [number, 'module' | 'subsystem'][],
  ): Map<number, NodeType> {
    return new Map(entries.map(([id, t]) => [id, t as NodeType]));
  }

  function sortedSegmentIds(chain: {segmentIds: number[]}): number[] {
    return [...chain.segmentIds].sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  describe('ControlChainResolutionService (spec §11.9)', () => {
    // -------------------------------------------------------------------------
    // Case 1: Empty input — fast path
    // -------------------------------------------------------------------------
    describe('empty input', () => {
      it('returns empty completeChains and incompleteChains', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [],
          nodeTypeMap: new Map(),
        };

        const result: ControlResolutionResult =
          ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toEqual([]);
        expect(result.incompleteChains).toEqual([]);
      });
    });

    // -------------------------------------------------------------------------
    // Case 2: Single complete chain — Module ↔ Subsystem ↔ Module
    // Segments:
    //   seg1: M1(1)  ↔ S(10),  port 100 (on M1)  ↔ port 200 (on S, outfacing)
    //   seg2: S(10)  ↔ M2(2),  port 201 (on S, infacing) ↔ port 300 (on M2)
    // Expected: one complete chain, segmentIds [1, 2], peerA = lower port (100, M1),
    // peerB = higher port (300, M2).
    // -------------------------------------------------------------------------
    describe('single complete chain (module ↔ subsystem ↔ module)', () => {
      it('resolves to one complete chain with canonical endpoint ordering', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 100, 200),
            seg(2, 10, 2, 201, 300),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toHaveLength(1);
        expect(result.incompleteChains).toEqual([]);

        const chain = result.completeChains[0];
        expect(sortedSegmentIds(chain)).toEqual([1, 2]);
        expect(chain.peerAPortSystemId).toBe(100);
        expect(chain.peerBPortSystemId).toBe(300);
        expect(chain.peerANodeSystemId).toBe(1);
        expect(chain.peerBNodeSystemId).toBe(2);
      });
    });

    // -------------------------------------------------------------------------
    // Case 3: Multiple independent complete chains
    // Chain A: M1(1) ↔ S(10) ↔ M2(2)   ports 101 / 301
    // Chain B: M3(3) ↔ S(20) ↔ M4(4)   ports 103 / 304
    // -------------------------------------------------------------------------
    describe('multiple independent complete chains', () => {
      it('returns both chains without cross-contamination', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 101, 201),
            seg(2, 10, 2, 202, 301),
            seg(3, 3, 20, 103, 203),
            seg(4, 20, 4, 204, 304),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
            [3, 'module'],
            [20, 'subsystem'],
            [4, 'module'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toHaveLength(2);
        expect(result.incompleteChains).toEqual([]);

        const chainA = result.completeChains.find(
          c => c.peerANodeSystemId === 1 || c.peerBNodeSystemId === 1,
        )!;
        const chainB = result.completeChains.find(
          c => c.peerANodeSystemId === 3 || c.peerBNodeSystemId === 3,
        )!;

        expect(sortedSegmentIds(chainA)).toEqual([1, 2]);
        expect(chainA.peerAPortSystemId).toBe(101);
        expect(chainA.peerBPortSystemId).toBe(301);
        expect(chainA.peerANodeSystemId).toBe(1);
        expect(chainA.peerBNodeSystemId).toBe(2);

        expect(sortedSegmentIds(chainB)).toEqual([3, 4]);
        expect(chainB.peerAPortSystemId).toBe(103);
        expect(chainB.peerBPortSystemId).toBe(304);
        expect(chainB.peerANodeSystemId).toBe(3);
        expect(chainB.peerBNodeSystemId).toBe(4);
      });
    });

    // -------------------------------------------------------------------------
    // Case 4: Incomplete chain — dead end at a subsystem node
    // Single segment: M1(1) ↔ S(10) with no further segment from S.
    // -------------------------------------------------------------------------
    describe('incomplete chain — dead end at subsystem', () => {
      it('reports an incomplete chain whose reachable nodes are the module and the subsystem', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [seg(1, 1, 10, 100, 200)],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toEqual([]);
        expect(result.incompleteChains).toHaveLength(1);

        const incomplete = result.incompleteChains[0];
        expect(incomplete.segmentIds).toEqual([1]);
        expect(new Set(incomplete.reachableNodeIds)).toEqual(new Set([1, 10]));
      });
    });

    // -------------------------------------------------------------------------
    // Case 5: Cycle detection
    // seg1: M1(1) ↔ S1(10)
    // seg2: S1(10) ↔ S2(20)
    // seg3: S2(20) ↔ S1(10)   (cycle: back to S1 via a different segment)
    // Expected: zero complete chains; at least one incomplete chain whose
    // reachable nodes include the cycle participants.
    // -------------------------------------------------------------------------
    describe('cycle detection', () => {
      it('reports incomplete and produces no complete chain when a cycle is reachable', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 100, 200),
            seg(2, 10, 20, 201, 300),
            seg(3, 20, 10, 301, 202),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toEqual([]);
        expect(result.incompleteChains.length).toBeGreaterThan(0);

        const allReportedSegmentIds = new Set(
          result.incompleteChains.flatMap(c => c.segmentIds),
        );
        expect(allReportedSegmentIds.has(1)).toBe(true);
        expect(allReportedSegmentIds.has(2)).toBe(true);
        expect(allReportedSegmentIds.has(3)).toBe(true);

        const allReachableNodes = new Set(
          result.incompleteChains.flatMap(c => c.reachableNodeIds),
        );
        expect(allReachableNodes.has(1)).toBe(true);
        expect(allReachableNodes.has(10)).toBe(true);
        expect(allReachableNodes.has(20)).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Case 6: Fan-out — one module connected to two outgoing segments
    // From M1(1):
    //   seg1: M1 ↔ S1(10) ↔ seg2 ↔ M2(2)
    //   seg3: M1 ↔ S2(20) ↔ seg4 ↔ M3(3)
    // Same module node, two distinct outgoing segments via two ports.
    // Expected: two complete chains, one per branch.
    // -------------------------------------------------------------------------
    describe('fan-out — one module with two outgoing segments', () => {
      it('walks both branches as independent complete chains', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 101, 201),
            seg(2, 10, 2, 202, 301),
            seg(3, 1, 20, 102, 401),
            seg(4, 20, 3, 402, 501),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
            [20, 'subsystem'],
            [3, 'module'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toHaveLength(2);
        expect(result.incompleteChains).toEqual([]);

        const chainToM2 = result.completeChains.find(
          c => c.peerANodeSystemId === 2 || c.peerBNodeSystemId === 2,
        )!;
        const chainToM3 = result.completeChains.find(
          c => c.peerANodeSystemId === 3 || c.peerBNodeSystemId === 3,
        )!;

        expect(sortedSegmentIds(chainToM2)).toEqual([1, 2]);
        expect(chainToM2.peerAPortSystemId).toBe(101);
        expect(chainToM2.peerBPortSystemId).toBe(301);
        expect(chainToM2.peerANodeSystemId).toBe(1);
        expect(chainToM2.peerBNodeSystemId).toBe(2);

        expect(sortedSegmentIds(chainToM3)).toEqual([3, 4]);
        expect(chainToM3.peerAPortSystemId).toBe(102);
        expect(chainToM3.peerBPortSystemId).toBe(501);
        expect(chainToM3.peerANodeSystemId).toBe(1);
        expect(chainToM3.peerBNodeSystemId).toBe(3);
      });
    });

    // -------------------------------------------------------------------------
    // Case 7: Reverse-direction equivalence
    // Walking M1 → S → M2 and M2 → S → M1 must produce the same canonical
    // ControlLink record. Each chain must be emitted exactly once.
    // -------------------------------------------------------------------------
    describe('reverse-direction equivalence', () => {
      it('emits exactly one complete chain regardless of traversal direction (port 100 < 300)', () => {
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 100, 200),
            seg(2, 10, 2, 201, 300),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toHaveLength(1);
        const chain = result.completeChains[0];
        expect(chain.peerAPortSystemId).toBe(100);
        expect(chain.peerBPortSystemId).toBe(300);
        expect(chain.peerANodeSystemId).toBe(1);
        expect(chain.peerBNodeSystemId).toBe(2);
      });

      it('also emits exactly one chain when the higher-port-id module is encountered first by DFS', () => {
        // Here M2's port (50) is the lower one and M1's port (500) is the higher
        // one. Canonical ordering must still place peerA at port 50 / node 2 and
        // peerB at port 500 / node 1, irrespective of which terminus the DFS
        // visits first.
        const input: ControlResolutionInput = {
          unresolvedSegments: [
            seg(1, 1, 10, 500, 200),
            seg(2, 10, 2, 201, 50),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
          ]),
        };

        const result = ControlChainResolutionService.resolve(input);

        expect(result.completeChains).toHaveLength(1);
        const chain = result.completeChains[0];
        expect(chain.peerAPortSystemId).toBe(50);
        expect(chain.peerBPortSystemId).toBe(500);
        expect(chain.peerANodeSystemId).toBe(2);
        expect(chain.peerBNodeSystemId).toBe(1);
      });
    });
  });
  ```

- [ ] **Step 2: Run the failing test to confirm the suite fails for the right reason**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-chain-resolution.service.spec"`

  Expected: FAIL with a module-resolution error like `Cannot find module '../../../../../src/domain/services/control-links/control-chain-resolution.service.js' from 'tests/unit/domain/services/control-links/control-chain-resolution.service.spec.ts'`. That confirms the test file is wired into Jest and is failing because the implementation does not yet exist — not because of a typo in the test itself.

---

### Task 10: Implement `ControlChainResolutionService`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/services/control-links/control-chain-resolution.service.ts` (new)

- [ ] **Step 1: Create the implementation file**

  Create `packages/core/src/domain/services/control-links/control-chain-resolution.service.ts`. The implementation builds an **undirected** adjacency map (each CSLS contributes two entries — one per direction), then runs DFS from every module node that appears in the segment set. A walk terminates as `complete` when the current node is a module node and is not the start node, and as `incomplete` on dead end or cycle. To make the resolver direction-agnostic (per the spec's canonical-ordering rule) every emitted chain is de-duplicated by its sorted segment-id signature so the forward and reverse traversals collapse to a single output row. Endpoint canonicalisation puts the lower port id into `peerAPortSystemId` / `peerANodeSystemId` and the higher port id into `peerBPortSystemId` / `peerBNodeSystemId`.

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {NodeType} from '../../entities/usecase-data/node/node.js';

  // ---------------------------------------------------------------------------
  // Public interfaces (spec §11.9)
  // ---------------------------------------------------------------------------

  export interface ControlResolutionInput {
    unresolvedSegments: {
      systemId:          number;
      peerNodeASystemId: number;
      peerNodeBSystemId: number;
      nodeAPortSystemId: number;
      nodeBPortSystemId: number;
    }[];
    nodeTypeMap: Map<number, NodeType>;
  }

  export interface ControlResolutionResult {
    completeChains: {
      segmentIds:        number[];
      peerAPortSystemId: number;
      peerBPortSystemId: number;
      peerANodeSystemId: number;
      peerBNodeSystemId: number;
    }[];
    incompleteChains: {
      segmentIds:       number[];
      reachableNodeIds: number[];
    }[];
  }

  // ---------------------------------------------------------------------------
  // Internal types
  // ---------------------------------------------------------------------------

  interface AdjacencyEdge {
    neighborNodeId:     number;
    segmentSystemId:    number;
    portOnThisNode:     number;
    portOnNeighborNode: number;
  }

  interface AccumulatedSegment {
    segmentId:      number;
    otherEndPort:   number;
    otherEndNode:   number;
  }

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  export const ControlChainResolutionService = {
    /**
     * Given all unresolved CSLS for a file, finds every complete undirected
     * path between two module nodes (a module-to-module control chain) and
     * returns the canonical information needed to create a ControlLink for
     * each. Also reports incomplete chains (dead ends and cycles).
     *
     * Algorithm (spec §11.9):
     *   1. Build undirected adjacency: nodeId → AdjacencyEdge[]. Every segment
     *      contributes two entries — one per direction.
     *   2. Collect every module node that appears in the segment set.
     *   3. For each such module node, run undirected DFS. Track `visited`
     *      nodes on the current branch to detect cycles. Skip the incoming
     *      segment when expanding so we never immediately walk back along
     *      the edge we just traversed.
     *   4. A walk terminates as `complete` when the current node is a module
     *      node and is not the start node. It terminates as `incomplete` on
     *      dead end (no remaining outgoing edges) or cycle (next edge points
     *      to a node already visited on this branch).
     *   5. Canonicalise endpoints by ordering peerAPortSystemId < peerBPortSystemId.
     *      Because the same chain is found from both terminus modules, we
     *      de-duplicate by the sorted segment-id signature so each chain is
     *      emitted exactly once.
     */
    resolve(input: ControlResolutionInput): ControlResolutionResult {
      const {unresolvedSegments, nodeTypeMap} = input;

      if (unresolvedSegments.length === 0) {
        return {completeChains: [], incompleteChains: []};
      }

      // Step 1: build undirected adjacency map.
      const adjacency = new Map<number, AdjacencyEdge[]>();
      const pushEdge = (from: number, edge: AdjacencyEdge): void => {
        const existing = adjacency.get(from);
        if (existing) {
          existing.push(edge);
        } else {
          adjacency.set(from, [edge]);
        }
      };

      for (const seg of unresolvedSegments) {
        pushEdge(seg.peerNodeASystemId, {
          neighborNodeId:     seg.peerNodeBSystemId,
          segmentSystemId:    seg.systemId,
          portOnThisNode:     seg.nodeAPortSystemId,
          portOnNeighborNode: seg.nodeBPortSystemId,
        });
        pushEdge(seg.peerNodeBSystemId, {
          neighborNodeId:     seg.peerNodeASystemId,
          segmentSystemId:    seg.systemId,
          portOnThisNode:     seg.nodeBPortSystemId,
          portOnNeighborNode: seg.nodeAPortSystemId,
        });
      }

      // Step 2: collect module nodes that appear in any segment.
      const moduleNodes: number[] = [];
      for (const nodeId of adjacency.keys()) {
        if (nodeTypeMap.get(nodeId) === NodeType.Module) {
          moduleNodes.push(nodeId);
        }
      }

      const completeChains:  ControlResolutionResult['completeChains']  = [];
      const incompleteChains: ControlResolutionResult['incompleteChains'] = [];
      const seenCompleteKeys:  Set<string> = new Set<string>();
      const seenIncompleteKeys: Set<string> = new Set<string>();

      // Steps 3–5: DFS from every module node.
      for (const startNode of moduleNodes) {
        const initialOutgoing = adjacency.get(startNode) ?? [];
        for (const firstEdge of initialOutgoing) {
          ControlChainResolutionService._walk(
            startNode,
            firstEdge.portOnThisNode,
            firstEdge.neighborNodeId,
            [
              {
                segmentId:    firstEdge.segmentSystemId,
                otherEndPort: firstEdge.portOnNeighborNode,
                otherEndNode: firstEdge.neighborNodeId,
              },
            ],
            new Set<number>([startNode, firstEdge.neighborNodeId]),
            [startNode, firstEdge.neighborNodeId],
            firstEdge.segmentSystemId,
            adjacency,
            nodeTypeMap,
            completeChains,
            incompleteChains,
            seenCompleteKeys,
            seenIncompleteKeys,
          );
        }
      }

      return {completeChains, incompleteChains};
    },

    /**
     * Recursive undirected DFS step. Records complete and incomplete chains
     * into the supplied accumulators. De-duplication keys are the sorted
     * segment-id signatures, so a chain discovered from both module ends
     * appears exactly once in the output.
     */
    _walk(
      startNode:           number,
      startPort:           number,
      currentNode:         number,
      accumulated:         AccumulatedSegment[],
      visited:             Set<number>,
      reachableNodes:      number[],
      incomingSegmentId:   number,
      adjacency:           Map<number, AdjacencyEdge[]>,
      nodeTypeMap:         Map<number, NodeType>,
      completeChains:      ControlResolutionResult['completeChains'],
      incompleteChains:    ControlResolutionResult['incompleteChains'],
      seenCompleteKeys:    Set<string>,
      seenIncompleteKeys:  Set<string>,
    ): void {
      // Complete: arrived at a module node that is not the start node.
      if (
        nodeTypeMap.get(currentNode) === NodeType.Module &&
        currentNode !== startNode
      ) {
        const segmentIds = accumulated.map(a => a.segmentId);
        const key = [...segmentIds].sort((a, b) => a - b).join(',');
        if (!seenCompleteKeys.has(key)) {
          seenCompleteKeys.add(key);
          const endPort = accumulated[accumulated.length - 1].otherEndPort;
          const aIsStart = startPort < endPort;
          completeChains.push({
            segmentIds,
            peerAPortSystemId: aIsStart ? startPort  : endPort,
            peerBPortSystemId: aIsStart ? endPort    : startPort,
            peerANodeSystemId: aIsStart ? startNode  : currentNode,
            peerBNodeSystemId: aIsStart ? currentNode : startNode,
          });
        }
        return;
      }

      const outgoing = adjacency.get(currentNode) ?? [];
      const candidateEdges = outgoing.filter(
        e => e.segmentSystemId !== incomingSegmentId,
      );

      // Dead end: no outgoing edges other than the one we arrived on.
      if (candidateEdges.length === 0) {
        const segmentIds = accumulated.map(a => a.segmentId);
        const key = [...segmentIds].sort((a, b) => a - b).join(',');
        if (!seenIncompleteKeys.has(key)) {
          seenIncompleteKeys.add(key);
          incompleteChains.push({
            segmentIds,
            reachableNodeIds: [...reachableNodes],
          });
        }
        return;
      }

      for (const edge of candidateEdges) {
        if (visited.has(edge.neighborNodeId)) {
          // Cycle on this edge — record the partial chain (including the
          // cycle-closing segment) as incomplete and stop this branch.
          const segmentIds = [
            ...accumulated.map(a => a.segmentId),
            edge.segmentSystemId,
          ];
          const key = [...segmentIds].sort((a, b) => a - b).join(',');
          if (!seenIncompleteKeys.has(key)) {
            seenIncompleteKeys.add(key);
            incompleteChains.push({
              segmentIds,
              reachableNodeIds: [...reachableNodes],
            });
          }
          continue;
        }

        const newVisited = new Set<number>(visited);
        newVisited.add(edge.neighborNodeId);

        ControlChainResolutionService._walk(
          startNode,
          startPort,
          edge.neighborNodeId,
          [
            ...accumulated,
            {
              segmentId:    edge.segmentSystemId,
              otherEndPort: edge.portOnNeighborNode,
              otherEndNode: edge.neighborNodeId,
            },
          ],
          newVisited,
          [...reachableNodes, edge.neighborNodeId],
          edge.segmentSystemId,
          adjacency,
          nodeTypeMap,
          completeChains,
          incompleteChains,
          seenCompleteKeys,
          seenIncompleteKeys,
        );
      }
    },
  } as const;
  ```

- [ ] **Step 2: Build `@arc/core` to confirm types compile**

  Run: `pnpm --filter @arc/core run build`

  Expected: build exits with code 0. No TypeScript errors. The new file should compile against the existing `NodeType` import.

---

### Task 11: Verify the suite passes and run regression checks

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/control-links/control-chain-resolution.service.spec.ts`
- Source: `packages/core/src/domain/services/control-links/control-chain-resolution.service.ts`

- [ ] **Step 1: Run the targeted test suite**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-chain-resolution.service.spec"`

  Expected: PASS. All eight `it()` cases green:

  1. `empty input > returns empty completeChains and incompleteChains`
  2. `single complete chain (module ↔ subsystem ↔ module) > resolves to one complete chain with canonical endpoint ordering`
  3. `multiple independent complete chains > returns both chains without cross-contamination`
  4. `incomplete chain — dead end at subsystem > reports an incomplete chain whose reachable nodes are the module and the subsystem`
  5. `cycle detection > reports incomplete and produces no complete chain when a cycle is reachable`
  6. `fan-out — one module with two outgoing segments > walks both branches as independent complete chains`
  7. `reverse-direction equivalence > emits exactly one complete chain regardless of traversal direction (port 100 < 300)`
  8. `reverse-direction equivalence > also emits exactly one chain when the higher-port-id module is encountered first by DFS`

- [ ] **Step 2: Run the full `@arc/core` unit-test suite as a regression guard**

  Run: `pnpm --filter @arc/core run test:unit:core`

  Expected: PASS. No previously passing test is broken by introducing `ControlChainResolutionService`. The new service is a leaf addition (no existing imports point at the new file), so a regression here would indicate either a Jest configuration leak or an unintended side-effect from the new test file — investigate and fix before committing.

- [ ] **Step 3: Typecheck the package end-to-end**

  Run: `pnpm --filter @arc/core run typecheck`

  Expected: exits 0 with no diagnostics. Confirms the exported `ControlResolutionInput` / `ControlResolutionResult` types and the `NodeType` import resolve cleanly under the `NodeNext`/ESM `.js` extension rule.

---

### Task 12: Commit

**Package:** `@arc/core`

- [ ] **Step 1: Use the `commit` skill to draft the commit message**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/domain/services/control-links/control-chain-resolution.service.ts \
          packages/core/tests/unit/domain/services/control-links/control-chain-resolution.service.spec.ts
  git commit -m "feat(core/services): add ControlChainResolutionService for undirected CSLS chain resolution" \
             -m "Introduces the pure-domain service that takes the file's unresolved Control Subsystem Link Segments and the per-node NodeType map and returns the complete module-to-module control chains plus the incomplete chains. Implementation builds an undirected adjacency map (each CSLS contributes two entries), runs DFS from every module node with cycle detection via a visited set, and canonicalises endpoints by peerAPortSystemId < peerBPortSystemId so forward and reverse traversals collapse to one output row. Spec §11.9." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

## Chapter self-review

- **Spec coverage.** §11.9 input shape (`unresolvedSegments[]` with `systemId`, peer A/B node ids, peer A/B port ids; `nodeTypeMap`) → `ControlResolutionInput` in Task 10. §11.9 output shape (`completeChains[]` with `segmentIds`, canonical `peerAPortSystemId < peerBPortSystemId`, `peerANodeSystemId`, `peerBNodeSystemId`; `incompleteChains[]` with `segmentIds`, `reachableNodeIds[]`) → `ControlResolutionResult` in Task 10. §11.9 algorithm (undirected adjacency with two entries per segment; DFS from every module node; visited-set cycle detection; complete-on-other-module-node; canonical port ordering) → Task 10 `_walk` body. §11.12 test list (single chain, multiple chains, dead end at subsystem, cycle, fan-out, reverse-direction equivalence) → seven of the eight Task 9 `it()` cases plus the empty-input fast path.
- **Placeholder scan.** No "TBD" / "TODO" / "fill in" / "handle edge cases" anywhere. Every code block is complete TypeScript — including the full DFS body and the canonicalisation branch.
- **Type consistency.** Field names match exactly across the test file, the public interfaces, and the service body: `unresolvedSegments`, `peerNodeASystemId`, `peerNodeBSystemId`, `nodeAPortSystemId`, `nodeBPortSystemId`, `nodeTypeMap`, `completeChains`, `incompleteChains`, `segmentIds`, `peerAPortSystemId`, `peerBPortSystemId`, `peerANodeSystemId`, `peerBNodeSystemId`, `reachableNodeIds`. The `NodeType` enum is the same one imported from `packages/core/src/domain/entities/usecase-data/node/node.ts` that the data-link `ChainResolutionService` already uses.
- **Out-of-scope guard.** No tasks touch §11.8 (`ControlIntentPropagationService`), §11.10 (`IControlSubsystemLinkSegmentRepository`), or §11.5–§11.7 (CSLS handlers). Those belong to sibling chapters.
