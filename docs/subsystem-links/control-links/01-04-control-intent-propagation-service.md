<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: `ControlIntentPropagationService` (§11.8)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.8 (lines 948–1016).
>
> **Goal of this chapter:** Add a new pure-domain service to `@arc/core` that exposes two independent, stateless operations on the CSLS graph:
>
> 1. `findPortsToClear(input: ClearInput): ClearResult` — given the remaining CSLS for a file after a segment deletion, return the systemIds of every subsystem-node port that now sits in a connected component containing no module node (those ports must have their intents cleared because they are no longer anchored).
> 2. `cascadePropagate(input: PropagateInput): PropagateResult` — given a port that has just received intents, flood-fill the CSLS graph and return every empty subsystem-node port reachable from it, stopping at module boundaries and at subsystem ports that already carry intents.
>
> Both operations are pure: no DB access, no I/O, no NestJS, no TypeORM. They live alongside the sibling `ControlChainResolutionService` produced by chapter §11.9.
>
> **Cardinal rule check:** the service lives in `packages/core/src/domain/services/control-links/` and depends only on the existing `NodeType` enum from `packages/core/src/domain/entities/usecase-data/node/node.js`. ESM `.js` extensions on all imports. Tested without mocks.

---

### Task 13: Write the failing unit-test suite for `ControlIntentPropagationService`

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/control-links/control-intent-propagation.service.spec.ts` (new)

- [ ] **Step 1: Create the test file**

  Create `packages/core/tests/unit/domain/services/control-links/control-intent-propagation.service.spec.ts`. The file contains **two top-level `describe` blocks** — one per operation — with concrete adjacency inputs and exact expected outputs. No `expect.any(...)` and no behavioural assertions. Every `it()` is targeted at a single algorithmic branch so the implementation has a hard target to hit.

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {
    ControlIntentPropagationService,
    type ClearInput,
    type ClearResult,
    type PropagateInput,
    type PropagateResult,
  } from '../../../../../src/domain/services/control-links/control-intent-propagation.service.js';
  import {NodeType} from '../../../../../src/domain/entities/usecase-data/node/node.js';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  type SegmentShape = ClearInput['remainingSegments'][number];

  function seg(
    peerNodeASystemId: number,
    peerNodeBSystemId: number,
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
  ): SegmentShape {
    return {
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

  function sortedNumbers(xs: number[]): number[] {
    return [...xs].sort((a, b) => a - b);
  }

  // ===========================================================================
  // Operation A: findPortsToClear
  // ===========================================================================

  describe('ControlIntentPropagationService.findPortsToClear (spec §11.8 Op A)', () => {
    // -------------------------------------------------------------------------
    // Case A1: Delete the module-end segment from an incomplete chain.
    //
    // Original (before delete):  M1(1) - seg1[p100-p200] - S(10)
    //                                 - seg2[p201-p300] - S(20)
    // After deleting seg1, remainingSegments = [seg2 only].
    // Component { 10, 20 } has no module → clear every subsystem port in it:
    // ports 201 (on S10) and 300 (on S20).
    // -------------------------------------------------------------------------
    describe('delete module-end segment from incomplete chain', () => {
      it('clears all downstream subsystem ports in the now-unanchored component', () => {
        const input: ClearInput = {
          remainingSegments: [seg(10, 20, 201, 300)],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
          ]),
          deletedSegment: {peerNodeASystemId: 1, peerNodeBSystemId: 10},
        };

        const result: ClearResult =
          ControlIntentPropagationService.findPortsToClear(input);

        expect(sortedNumbers(result.portsToClear)).toEqual([201, 300]);
      });
    });

    // -------------------------------------------------------------------------
    // Case A2: Delete the middle segment of an incomplete chain. The chain
    // splits into two components — one still anchored to a module (keep its
    // intents), one fully unanchored (clear it).
    //
    // Original:  M1(1) - seg1[p100-p200] - S(10) - seg2[p201-p300] - S(20)
    //                  - seg3[p301-p400] - S(30)
    // Delete seg2. remainingSegments = [seg1, seg3].
    //   Component A: { 1 (Module), 10 } — has module → DO NOT clear (ports 100, 200 stay).
    //   Component B: { 20, 30 }         — no module → CLEAR ports 301, 400.
    // -------------------------------------------------------------------------
    describe('delete middle segment of incomplete chain', () => {
      it('clears only the now-isolated downstream component, not the still-anchored side', () => {
        const input: ClearInput = {
          remainingSegments: [
            seg(1, 10, 100, 200),
            seg(20, 30, 301, 400),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
            [30, 'subsystem'],
          ]),
          deletedSegment: {peerNodeASystemId: 10, peerNodeBSystemId: 20},
        };

        const result = ControlIntentPropagationService.findPortsToClear(input);

        expect(sortedNumbers(result.portsToClear)).toEqual([301, 400]);
      });
    });

    // -------------------------------------------------------------------------
    // Case A3: A sibling segment still reaches a module — no ports cleared.
    //
    // Topology before delete:
    //   seg1[1-10, p100-p200]   — M1 ↔ S10
    //   seg2[10-2, p201-p302]   — S10 ↔ M2   (sibling: still anchors S10 to a module)
    //   seg3[10-20, p202-p400]  — S10 ↔ S20  (dangling)
    //
    // Delete seg3. remainingSegments = [seg1, seg2].
    // Component A: { 1 (M), 10 (S), 2 (M) } — has modules → DO NOT clear (ports 100, 200, 201, 302 stay).
    // Node 20 no longer appears in any remaining segment → not in any component → nothing collected from it.
    // -------------------------------------------------------------------------
    describe('sibling segment still reaches a module', () => {
      it('returns an empty portsToClear when the affected node retains a module path', () => {
        const input: ClearInput = {
          remainingSegments: [
            seg(1, 10, 100, 200),
            seg(10, 2, 201, 302),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
            [20, 'subsystem'],
          ]),
          deletedSegment: {peerNodeASystemId: 10, peerNodeBSystemId: 20},
        };

        const result = ControlIntentPropagationService.findPortsToClear(input);

        expect(result.portsToClear).toEqual([]);
      });
    });

    // -------------------------------------------------------------------------
    // Case A4: Truly isolated subsystem-only component — both endpoint ports returned.
    //
    // remainingSegments = [seg1[10-20, p200-p300]]  (a lone S↔S segment, no modules in the component)
    // deletedSegment was the M1↔S10 segment that used to anchor the chain.
    // Component { 10, 20 } has no module → clear ports 200, 300.
    // -------------------------------------------------------------------------
    describe('truly isolated subsystem-only component', () => {
      it('returns every subsystem-node port in the component', () => {
        const input: ClearInput = {
          remainingSegments: [seg(10, 20, 200, 300)],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
          ]),
          deletedSegment: {peerNodeASystemId: 1, peerNodeBSystemId: 10},
        };

        const result = ControlIntentPropagationService.findPortsToClear(input);

        expect(sortedNumbers(result.portsToClear)).toEqual([200, 300]);
      });
    });
  });

  // ===========================================================================
  // Operation B: cascadePropagate
  // ===========================================================================

  describe('ControlIntentPropagationService.cascadePropagate (spec §11.8 Op B)', () => {
    // -------------------------------------------------------------------------
    // Case B1: Single restore — cascade fills every connected empty subsystem port.
    //
    // Graph: M1(1) -seg1[p100-p200]- S(10) -seg2[p201-p300]- S(20) -seg3[p301-p400]- M2(2)
    // startPort = 200 (just received intents from seg1 propagation).
    // Empty subsystem ports remaining: 201, 300, 301. Cascade fills all three.
    // -------------------------------------------------------------------------
    describe('single restore cascades through every connected empty port', () => {
      it('fills 201, 300, 301 with the supplied intentIds', () => {
        const input: PropagateInput = {
          startPortSystemId: 200,
          intentIds: [42, 43],
          allSegments: [
            seg(1, 10, 100, 200),
            seg(10, 20, 201, 300),
            seg(20, 2, 301, 400),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
            [2, 'module'],
          ]),
          portIntentMap: new Map<number, number[]>([
            [100, []],
            [200, [42, 43]],
            [201, []],
            [300, []],
            [301, []],
            [400, []],
          ]),
        };

        const result: PropagateResult =
          ControlIntentPropagationService.cascadePropagate(input);

        const filledPortIds = sortedNumbers(
          result.portsToFill.map(p => p.portSystemId),
        );
        expect(filledPortIds).toEqual([201, 300, 301]);
        for (const entry of result.portsToFill) {
          expect(entry.intentIds).toEqual([42, 43]);
        }
      });
    });

    // -------------------------------------------------------------------------
    // Case B2: Cascade stops at module boundary.
    //
    // Graph: M1(1) -seg1[p100-p200]- S(10) -seg2[p201-p300]- M2(2)
    // startPort = 200. Only port 201 should be filled; segment to M2 stops at p300 (module).
    // -------------------------------------------------------------------------
    describe('cascade stops at module boundary', () => {
      it('does not cross from a subsystem port into a module port', () => {
        const input: PropagateInput = {
          startPortSystemId: 200,
          intentIds: [7],
          allSegments: [
            seg(1, 10, 100, 200),
            seg(10, 2, 201, 300),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
          ]),
          portIntentMap: new Map<number, number[]>([
            [100, []],
            [200, [7]],
            [201, []],
            [300, []],
          ]),
        };

        const result = ControlIntentPropagationService.cascadePropagate(input);

        expect(result.portsToFill).toHaveLength(1);
        expect(result.portsToFill[0]).toEqual({portSystemId: 201, intentIds: [7]});
      });
    });

    // -------------------------------------------------------------------------
    // Case B3: Cascade stops at an already-populated subsystem port.
    //
    // Graph: M1(1) -seg1[p100-p200]- S(10) -seg2[p201-p300]- S(20) -seg3[p301-p400]- M2(2)
    // startPort = 200. portIntentMap shows 300 already has intents [99].
    // Cascade fills 201, but stops at 300 (already populated) → does NOT propagate to 301.
    // -------------------------------------------------------------------------
    describe('cascade stops at an already-populated subsystem port', () => {
      it('does not propagate past a port that already carries intents', () => {
        const input: PropagateInput = {
          startPortSystemId: 200,
          intentIds: [42],
          allSegments: [
            seg(1, 10, 100, 200),
            seg(10, 20, 201, 300),
            seg(20, 2, 301, 400),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
            [2, 'module'],
          ]),
          portIntentMap: new Map<number, number[]>([
            [100, []],
            [200, [42]],
            [201, []],
            [300, [99]],
            [301, []],
            [400, []],
          ]),
        };

        const result = ControlIntentPropagationService.cascadePropagate(input);

        expect(result.portsToFill).toHaveLength(1);
        expect(result.portsToFill[0]).toEqual({portSystemId: 201, intentIds: [42]});
      });
    });

    // -------------------------------------------------------------------------
    // Case B4: Cascade has no reachable empty subsystem ports.
    //
    // Graph: M1(1) -seg1[p100-p200]- S(10) -seg2[p201-p300]- M2(2)
    // startPort = 200. The only other subsystem port (201) is already populated.
    // The only segment-graph neighbour of 200 is 100 (module). Result: empty portsToFill.
    // -------------------------------------------------------------------------
    describe('cascade with no reachable empty subsystem ports', () => {
      it('returns an empty portsToFill', () => {
        const input: PropagateInput = {
          startPortSystemId: 200,
          intentIds: [42],
          allSegments: [
            seg(1, 10, 100, 200),
            seg(10, 2, 201, 300),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [2, 'module'],
          ]),
          portIntentMap: new Map<number, number[]>([
            [100, []],
            [200, [42]],
            [201, [42]],
            [300, []],
          ]),
        };

        const result = ControlIntentPropagationService.cascadePropagate(input);

        expect(result.portsToFill).toEqual([]);
      });
    });

    // -------------------------------------------------------------------------
    // Case B5: Single segment draw triggers a chain-of-three cascade.
    //
    // The caller has just drawn seg1 (M1 ↔ S10), populated S10.p200 directly,
    // and now invokes cascadePropagate. Beyond S10.p200, three empty subsystem
    // ports remain in the existing CSLS graph: 201 (S10), 300 (S20), 301 (S20).
    //
    // Graph: M1(1) -seg1[p100-p200]- S(10) -seg2[p201-p300]- S(20) -seg3[p301-p400]- M2(2)
    // startPort = 200.
    // Expected portsToFill (set): { 201, 300, 301 }, each with intentIds [11].
    // -------------------------------------------------------------------------
    describe('single segment draw fills a chain of three empty ports', () => {
      it('returns 201, 300, 301 in a single cascade pass', () => {
        const input: PropagateInput = {
          startPortSystemId: 200,
          intentIds: [11],
          allSegments: [
            seg(1, 10, 100, 200),
            seg(10, 20, 201, 300),
            seg(20, 2, 301, 400),
          ],
          nodeTypeMap: nodeTypeMap([
            [1, 'module'],
            [10, 'subsystem'],
            [20, 'subsystem'],
            [2, 'module'],
          ]),
          portIntentMap: new Map<number, number[]>([
            [100, []],
            [200, [11]],
            [201, []],
            [300, []],
            [301, []],
            [400, []],
          ]),
        };

        const result = ControlIntentPropagationService.cascadePropagate(input);

        expect(result.portsToFill).toHaveLength(3);
        const filledPortIds = sortedNumbers(
          result.portsToFill.map(p => p.portSystemId),
        );
        expect(filledPortIds).toEqual([201, 300, 301]);
        for (const entry of result.portsToFill) {
          expect(entry.intentIds).toEqual([11]);
        }
      });
    });
  });
  ```

- [ ] **Step 2: Run the failing test to confirm the suite fails for the right reason**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-intent-propagation.service.spec"`

  Expected: FAIL with a module-resolution error like `Cannot find module '../../../../../src/domain/services/control-links/control-intent-propagation.service.js' from 'tests/unit/domain/services/control-links/control-intent-propagation.service.spec.ts'`. That confirms the test file is wired into Jest and is failing because the implementation does not yet exist — not because of a typo in the test itself.

---

### Task 14: Implement `findPortsToClear` (Operation A)

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/domain/services/control-links/control-intent-propagation.service.ts` (new — stub the second method so the file compiles, but only flesh out Op A in this task)

- [ ] **Step 1: Create the implementation file with `findPortsToClear` fully implemented and `cascadePropagate` stubbed**

  Create `packages/core/src/domain/services/control-links/control-intent-propagation.service.ts`. The implementation builds an undirected adjacency over the remaining segments, then runs BFS from each peer node of the deleted segment to discover its connected component. For each component with no module node, every subsystem-port endpoint in that component is collected. Ports are de-duplicated by systemId.

  `cascadePropagate` is stubbed in this task so the file compiles cleanly and so the next task can drive it via TDD with its dedicated tests still failing.

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {NodeType} from '../../entities/usecase-data/node/node.js';

  // ---------------------------------------------------------------------------
  // Public interfaces (spec §11.8)
  // ---------------------------------------------------------------------------

  export interface ClearInput {
    remainingSegments: {
      peerNodeASystemId: number;
      peerNodeBSystemId: number;
      nodeAPortSystemId: number;
      nodeBPortSystemId: number;
    }[];
    nodeTypeMap:    Map<number, NodeType>;
    deletedSegment: {peerNodeASystemId: number; peerNodeBSystemId: number};
  }

  export interface ClearResult {
    portsToClear: number[];
  }

  export interface PropagateInput {
    startPortSystemId: number;
    intentIds:         number[];
    allSegments: {
      peerNodeASystemId: number;
      peerNodeBSystemId: number;
      nodeAPortSystemId: number;
      nodeBPortSystemId: number;
    }[];
    nodeTypeMap:   Map<number, NodeType>;
    portIntentMap: Map<number, number[]>;
  }

  export interface PropagateResult {
    portsToFill: {portSystemId: number; intentIds: number[]}[];
  }

  // ---------------------------------------------------------------------------
  // Internal adjacency types
  // ---------------------------------------------------------------------------

  interface NodeAdjacencyEntry {
    neighborNodeId: number;
    portOnThisNode: number;
  }

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  export const ControlIntentPropagationService = {
    /**
     * Operation A — given the CSLS still present after a segment deletion and
     * the per-node NodeType map, find every subsystem-node port that now sits
     * in a connected component containing no module node. Those ports must
     * have their intents cleared (they are no longer anchored to a module).
     *
     * Algorithm (spec §11.8 Op A):
     *   1. Build an undirected adjacency over `remainingSegments` where each
     *      entry records the neighbor node id and the port systemId on the
     *      current node (so we can collect that port if the component is
     *      unanchored).
     *   2. From each peer node of the deleted segment, run a BFS to discover
     *      its connected component (set of node ids and set of port ids on
     *      this side of every segment in the component).
     *   3. If the component contains no module node, every collected port that
     *      belongs to a subsystem node is added to `portsToClear`.
     *   4. De-duplicate `portsToClear` by systemId.
     */
    findPortsToClear(input: ClearInput): ClearResult {
      const {remainingSegments, nodeTypeMap, deletedSegment} = input;

      // Step 1: undirected adjacency. Each segment contributes two entries.
      const adjacency = new Map<number, NodeAdjacencyEntry[]>();
      const pushEntry = (from: number, entry: NodeAdjacencyEntry): void => {
        const existing = adjacency.get(from);
        if (existing) {
          existing.push(entry);
        } else {
          adjacency.set(from, [entry]);
        }
      };

      for (const s of remainingSegments) {
        pushEntry(s.peerNodeASystemId, {
          neighborNodeId: s.peerNodeBSystemId,
          portOnThisNode: s.nodeAPortSystemId,
        });
        pushEntry(s.peerNodeBSystemId, {
          neighborNodeId: s.peerNodeASystemId,
          portOnThisNode: s.nodeBPortSystemId,
        });
      }

      // Step 2–4: BFS each peer node of the deleted segment. Only nodes that
      // still appear in the remaining-adjacency map are walked; an orphan node
      // that has no remaining segments contributes nothing.
      const portsToClear = new Set<number>();
      const seenNodes = new Set<number>();

      const startCandidates = [
        deletedSegment.peerNodeASystemId,
        deletedSegment.peerNodeBSystemId,
      ];

      for (const startNode of startCandidates) {
        if (seenNodes.has(startNode)) continue;
        if (!adjacency.has(startNode)) continue;

        // BFS this component.
        const componentNodes = new Set<number>([startNode]);
        const componentPorts = new Set<number>();
        const queue: number[] = [startNode];

        while (queue.length > 0) {
          const current = queue.shift()!;
          const edges = adjacency.get(current) ?? [];
          for (const edge of edges) {
            componentPorts.add(edge.portOnThisNode);
            if (!componentNodes.has(edge.neighborNodeId)) {
              componentNodes.add(edge.neighborNodeId);
              queue.push(edge.neighborNodeId);
            }
          }
        }

        for (const nodeId of componentNodes) seenNodes.add(nodeId);

        // Component has a module → leave its ports alone.
        let hasModule = false;
        for (const nodeId of componentNodes) {
          if (nodeTypeMap.get(nodeId) === NodeType.Module) {
            hasModule = true;
            break;
          }
        }
        if (hasModule) continue;

        // No module in component → collect every subsystem-node port in it.
        // (`componentPorts` was populated by walking adjacency entries whose
        // `portOnThisNode` is by construction on a node we just visited, so
        // we re-check the node type per port via the segment data below.)
        for (const s of remainingSegments) {
          if (componentNodes.has(s.peerNodeASystemId) &&
              nodeTypeMap.get(s.peerNodeASystemId) === NodeType.Subsystem) {
            portsToClear.add(s.nodeAPortSystemId);
          }
          if (componentNodes.has(s.peerNodeBSystemId) &&
              nodeTypeMap.get(s.peerNodeBSystemId) === NodeType.Subsystem) {
            portsToClear.add(s.nodeBPortSystemId);
          }
        }
      }

      return {portsToClear: [...portsToClear]};
    },

    /**
     * Operation B — implemented in Task 15. Stubbed here so the file compiles
     * and so the Task 13 tests for Operation A can be driven green by this
     * task while the Operation B tests stay red until Task 15.
     */
    cascadePropagate(_input: PropagateInput): PropagateResult {
      throw new Error('ControlIntentPropagationService.cascadePropagate not yet implemented');
    },
  } as const;
  ```

- [ ] **Step 2: Run only the `findPortsToClear` describe block and confirm it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-intent-propagation.service.spec" -t "findPortsToClear"`

  Expected: PASS. All four Operation A cases green:

  1. `delete module-end segment from incomplete chain > clears all downstream subsystem ports in the now-unanchored component`
  2. `delete middle segment of incomplete chain > clears only the now-isolated downstream component, not the still-anchored side`
  3. `sibling segment still reaches a module > returns an empty portsToClear when the affected node retains a module path`
  4. `truly isolated subsystem-only component > returns every subsystem-node port in the component`

  The Operation B tests are still expected to fail (they hit the stubbed `throw`) — that is fine; Task 15 turns them green.

- [ ] **Step 3: Build the package to confirm types compile**

  Run: `pnpm --filter @arc/core run build`

  Expected: build exits with code 0. No TypeScript errors. The new exported interfaces (`ClearInput`, `ClearResult`, `PropagateInput`, `PropagateResult`) resolve cleanly against `NodeType`.

---

### Task 15: Implement `cascadePropagate` (Operation B)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/domain/services/control-links/control-intent-propagation.service.ts`

- [ ] **Step 1: Replace the `cascadePropagate` stub with the BFS flood-fill implementation**

  In `packages/core/src/domain/services/control-links/control-intent-propagation.service.ts`, replace the body of the `cascadePropagate` method (the one that currently `throw`s) with the implementation below. Leave `findPortsToClear` and the exported interfaces unchanged.

  The implementation models the CSLS graph at the **port level** with two kinds of undirected edges:
  - *Segment edges*: the two ports across a CSLS — `nodeAPortSystemId` ↔ `nodeBPortSystemId`.
  - *Through-node edges*: any two ports that belong to the same subsystem node — intent flows through a subsystem from one of its control ports to another.

  BFS proceeds over ports. At each dequeued port we (a) follow segment edges to peer ports, and (b) — if the dequeued port belongs to a subsystem node — follow through-node edges to its sibling ports. For each visit, the three stopping rules from §11.8 apply: stop at module-owned ports; stop at subsystem ports with existing intents; otherwise add to `portsToFill` and continue traversal. The starting port is marked visited but never added to `portsToFill` (the caller has already populated it).

  Replace **only** the body of the `cascadePropagate` method. Use this implementation verbatim:

  ```typescript
  cascadePropagate(input: PropagateInput): PropagateResult {
    const {
      startPortSystemId,
      intentIds,
      allSegments,
      nodeTypeMap,
      portIntentMap,
    } = input;

    // Build port-level adjacency.
    //
    //   portToNode: portSystemId  -> owning nodeSystemId
    //   nodeToPorts: nodeSystemId -> Set of portSystemIds belonging to that node
    //   segmentEdges: portSystemId -> array of { peerPort, peerNode } across segments
    const portToNode    = new Map<number, number>();
    const nodeToPorts   = new Map<number, Set<number>>();
    const segmentEdges  = new Map<number, {peerPort: number; peerNode: number}[]>();

    const addNodePort = (nodeId: number, portId: number): void => {
      let set = nodeToPorts.get(nodeId);
      if (!set) {
        set = new Set<number>();
        nodeToPorts.set(nodeId, set);
      }
      set.add(portId);
    };

    const addSegmentEdge = (
      fromPort: number,
      peerPort: number,
      peerNode: number,
    ): void => {
      let edges = segmentEdges.get(fromPort);
      if (!edges) {
        edges = [];
        segmentEdges.set(fromPort, edges);
      }
      edges.push({peerPort, peerNode});
    };

    for (const s of allSegments) {
      portToNode.set(s.nodeAPortSystemId, s.peerNodeASystemId);
      portToNode.set(s.nodeBPortSystemId, s.peerNodeBSystemId);
      addNodePort(s.peerNodeASystemId, s.nodeAPortSystemId);
      addNodePort(s.peerNodeBSystemId, s.nodeBPortSystemId);
      addSegmentEdge(s.nodeAPortSystemId, s.nodeBPortSystemId, s.peerNodeBSystemId);
      addSegmentEdge(s.nodeBPortSystemId, s.nodeAPortSystemId, s.peerNodeASystemId);
    }

    // BFS flood-fill over ports.
    const portsToFill: PropagateResult['portsToFill'] = [];
    const visited = new Set<number>([startPortSystemId]);
    const queue: number[] = [startPortSystemId];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // (a) Segment edges — visit the peer port across each incident segment.
      for (const {peerPort, peerNode} of segmentEdges.get(current) ?? []) {
        if (visited.has(peerPort)) continue;
        visited.add(peerPort);

        // Rule 1: stop at module boundary.
        if (nodeTypeMap.get(peerNode) === NodeType.Module) continue;

        // Rule 2: stop at subsystem port with existing intents.
        const existing = portIntentMap.get(peerPort) ?? [];
        if (existing.length > 0) continue;

        // Rule 3: empty subsystem port — fill and continue traversal through it.
        portsToFill.push({portSystemId: peerPort, intentIds});
        queue.push(peerPort);
      }

      // (b) Through-node edges — visit the other ports on `current`'s subsystem node.
      // The start port is itself on a subsystem (it was just filled), so this branch
      // also fans the cascade out from the start.
      const currentNode = portToNode.get(current);
      if (currentNode !== undefined &&
          nodeTypeMap.get(currentNode) === NodeType.Subsystem) {
        for (const siblingPort of nodeToPorts.get(currentNode) ?? new Set<number>()) {
          if (siblingPort === current || visited.has(siblingPort)) continue;
          visited.add(siblingPort);

          // Sibling lives on a subsystem (currentNode is subsystem by construction).
          const existing = portIntentMap.get(siblingPort) ?? [];
          if (existing.length > 0) continue;  // stop branch

          portsToFill.push({portSystemId: siblingPort, intentIds});
          queue.push(siblingPort);
        }
      }
    }

    return {portsToFill};
  },
  ```

- [ ] **Step 2: Run the full spec file and confirm every case passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="control-intent-propagation.service.spec"`

  Expected: PASS. All nine `it()` cases green — four under `findPortsToClear`, five under `cascadePropagate`:

  1. `findPortsToClear > delete module-end segment from incomplete chain > clears all downstream subsystem ports in the now-unanchored component`
  2. `findPortsToClear > delete middle segment of incomplete chain > clears only the now-isolated downstream component, not the still-anchored side`
  3. `findPortsToClear > sibling segment still reaches a module > returns an empty portsToClear when the affected node retains a module path`
  4. `findPortsToClear > truly isolated subsystem-only component > returns every subsystem-node port in the component`
  5. `cascadePropagate > single restore cascades through every connected empty port > fills 201, 300, 301 with the supplied intentIds`
  6. `cascadePropagate > cascade stops at module boundary > does not cross from a subsystem port into a module port`
  7. `cascadePropagate > cascade stops at an already-populated subsystem port > does not propagate past a port that already carries intents`
  8. `cascadePropagate > cascade with no reachable empty subsystem ports > returns an empty portsToFill`
  9. `cascadePropagate > single segment draw fills a chain of three empty ports > returns 201, 300, 301 in a single cascade pass`

---

### Task 16: Regression — typecheck and full `@arc/core` unit-test suite

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/unit/domain/services/control-links/control-intent-propagation.service.spec.ts`
- Source: `packages/core/src/domain/services/control-links/control-intent-propagation.service.ts`

- [ ] **Step 1: Typecheck the package end-to-end**

  Run: `pnpm --filter @arc/core run typecheck`

  Expected: exits 0 with no diagnostics. Confirms the exported `ClearInput` / `ClearResult` / `PropagateInput` / `PropagateResult` types and the `NodeType` import resolve cleanly under the `NodeNext`/ESM `.js` extension rule.

- [ ] **Step 2: Run the full `@arc/core` unit-test suite as a regression guard**

  Run: `pnpm --filter @arc/core run test:unit:core`

  Expected: PASS. No previously passing test is broken by introducing `ControlIntentPropagationService`. The new service is a leaf addition (no existing imports point at the new file), so a regression here would indicate a Jest configuration leak or an unintended side-effect from the new test file — investigate and fix before committing.

---

### Task 17: Commit

**Package:** `@arc/core`

- [ ] **Step 1: Use the `commit` skill to draft the commit message**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/domain/services/control-links/control-intent-propagation.service.ts \
          packages/core/tests/unit/domain/services/control-links/control-intent-propagation.service.spec.ts
  git commit -m "feat(core/services): add ControlIntentPropagationService for CSLS clear and cascade" \
             -m "Introduces a pure-domain service that exposes two stateless operations on the Control Subsystem Link Segment graph. findPortsToClear builds an undirected adjacency over the remaining segments, runs BFS from each peer node of the deleted segment, and collects every subsystem-node port in any connected component that contains no module node. cascadePropagate models the CSLS at the port level with segment edges and through-node edges, then runs BFS from the just-filled start port; it stops at module boundaries and at subsystem ports that already carry intents, and emits portsToFill for every empty subsystem port reached. Spec §11.8." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

## Chapter self-review

- **Spec coverage.** §11.8 Op A input shape (`remainingSegments[]` with peer A/B node ids and node A/B port ids; `nodeTypeMap`; `deletedSegment` with peer A/B node ids) → `ClearInput` in Task 14. §11.8 Op A output shape (`portsToClear: number[]`) → `ClearResult` in Task 14. §11.8 Op A algorithm (undirected adjacency from remaining segments; connected-component analysis; collect subsystem-node ports in components with no module) → Task 14 `findPortsToClear` body. §11.8 Op B input shape (`startPortSystemId`, `intentIds`, `allSegments[]`, `nodeTypeMap`, `portIntentMap`) → `PropagateInput` in Task 14. §11.8 Op B output shape (`portsToFill[]` of `{portSystemId, intentIds}`) → `PropagateResult` in Task 14. §11.8 Op B algorithm (BFS flood-fill; stop at module boundary; stop at already-populated subsystem port; otherwise fill and continue traversal through the node) → Task 15 `cascadePropagate` body. Test cases (delete module-end, delete middle, sibling still anchored, isolated port; cascade fills all, stops at module, stops at populated port, no reachable empty ports, chain-of-three from single draw) → Task 13 test file.
- **Placeholder scan.** No "TBD" / "TODO" / "fill in" / "handle edge cases" anywhere. Every code block is complete TypeScript — including the full BFS bodies, the through-node fan-out, the module / already-populated rejection branches, and the de-duplication of `portsToClear`.
- **Type consistency.** Field names match exactly across the test file, the public interfaces, and the two service methods: `remainingSegments`, `peerNodeASystemId`, `peerNodeBSystemId`, `nodeAPortSystemId`, `nodeBPortSystemId`, `nodeTypeMap`, `deletedSegment`, `portsToClear`, `startPortSystemId`, `intentIds`, `allSegments`, `portIntentMap`, `portsToFill`, `portSystemId`. The `NodeType` enum is the same one used by the sibling `ControlChainResolutionService` (`packages/core/src/domain/entities/usecase-data/node/node.ts`).
- **Out-of-scope guard.** No tasks touch §11.9 (`ControlChainResolutionService`), §11.1–§11.3 (schema and CSLS entity), §11.5–§11.7 (CSLS handlers), or §11.10 (`IControlSubsystemLinkSegmentRepository`). Those belong to sibling chapters.
- **TDD ordering.** Task 13 writes a failing test suite and verifies the failure is a module-not-found (the right failure mode). Task 14 turns Op A green while leaving Op B explicitly red via a `throw`-stub. Task 15 turns Op B green. Task 16 runs the full package regression and typecheck. Task 17 commits under the same `core/services` scope used by the sibling §11.9 chapter, with an explicit STOP gate before `git commit`.
