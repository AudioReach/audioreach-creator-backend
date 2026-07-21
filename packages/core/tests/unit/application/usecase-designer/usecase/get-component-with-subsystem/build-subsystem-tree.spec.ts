/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {buildSubsystemTree} from '../../../../../../src/application/usecase-designer/usecase/get-component-with-subsystem/build-subsystem-tree.js';
import type {SpfModuleReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {DataLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/control-link-read-model.js';
import type {SubsystemReadModel} from '../../../../../../src/application/ports/persistence/query-services/subsystem/subsystem-read-model.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';

// =============================================================================
// Node / Subsystem IDs
//
// Fixed numeric IDs used across all scenarios. Kept as named constants so every
// assertion reads as "the node we intended" rather than a bare number.
//
// Topology reused across scenarios:
//
//   Top-level (no subsystem parent):   M1, M2
//   Inside SS  (parentId = SS):        M3, M4
//   Inside SS1 (parentId = SS1):       M5, M6   ← added in scenario B / deleted in scenario C
//   Inside SS_B (parentId = SS_A):     M_DEEP   ← structural-ancestor scenario only
//
//   SS  = root subsystem        (parentId = undefined)
//   SS1 = child of SS           (parentId = SS)       ← appears after edit-session add
//   SS_A = root subsystem       (parentId = undefined) ← structural-ancestor scenario
//   SS_B = child of SS_A        (parentId = SS_A)      ← structural-ancestor scenario
// =============================================================================
const M1 = 10,
  M2 = 20,
  M3 = 30,
  M4 = 40,
  M5 = 50,
  M6 = 60,
  M_DEEP = 70;
const SS = 100,
  SS1 = 200,
  SS_A = 300,
  SS_B = 400;
const BASE_PORT = 5000; // base value for dummy port IDs

// =============================================================================
// Minimal factories — only the fields buildSubsystemTree actually reads are
// populated meaningfully; everything else uses harmless sentinel values so the
// TypeScript type is satisfied without noise in the test data.
// =============================================================================

function makeModule(id: number, parentId?: number): SpfModuleReadModel {
  return {
    systemId: id,
    parentId,
    instanceId: id,
    alias: `mod_${id}`,
    definitionSystemId: id + 1000,
    name: `Module ${id}`,
    moduleId: id,
    subgraphId: 9000,
    containerId: 8000,
    maxInputPortsSupported: 4,
    maxOutputPortsSupported: 4,
    maxControlPortsSupported: 4,
    dataPorts: [],
    controlPorts: [],
  };
}

function makeDataLink(id: number, src: number, dst: number): DataLinkReadModel {
  return {
    systemId: id,
    sourceNodeSystemId: src,
    destinationNodeSystemId: dst,
    sourcePortSystemId: BASE_PORT + id,
    destinationPortSystemId: BASE_PORT + 100 + id,
    linkType: LINK_TYPE.IntraUsecase,
    isEc: null,
  };
}

function makeControlLink(
  id: number,
  peerA: number,
  peerB: number,
): ControlLinkReadModel {
  return {
    systemId: id,
    peerNodeASystemId: peerA,
    peerNodeBSystemId: peerB,
    nodeAPortSystemId: BASE_PORT + 200 + id,
    nodeBPortSystemId: BASE_PORT + 300 + id,
    heapId: 0,
    linkType: LINK_TYPE.IntraUsecase,
  };
}

function makeSub(id: number, parentId?: number): SubsystemReadModel {
  return {systemId: id, name: `SS_${id}`, parentId, filteredKeys: []};
}

/** Returns the systemIds present in an array of links (data or control). */
function linkIds(links: Array<{systemId: number}>): number[] {
  return links.map(l => l.systemId).sort((a, b) => a - b);
}

// =============================================================================
// Link constants for the primary topology
//
// Raw links come from dataLinkQueryService.findByUsecaseIds — they are always
// module-to-module.  Virtual segments come from
// subsystemQueryService.findDataLinkSegmentsByUsecaseIds — boundary-crossing
// links generate two virtual segment rows; non-boundary links generate one row
// identical to the raw link (but with both module IDs, so the handler's
// subsystem-endpoint filter drops it before buildSubsystemTree sees it).
//
// buildSubsystemTree receives the combined flat array that the handler assembles:
//   flat.dataLinks = rawLinks + filteredVirtualSegments
//
// In these unit tests we deliberately pass BOTH the raw boundary-crossing link
// AND its corresponding virtual segments to buildSubsystemTree so that the tests
// verify the natural dropping behaviour of the levelNodeIds filter (the tree
// builder drops boundary-crossing raw links because neither endpoint is visible
// at any single level).
//
// Link ID map:
//   L1_RAW   =  1  m1 → m2     non-boundary raw link at top level
//   L2_RAW   =  2  m2 → m3     boundary-crossing raw link (m3 inside SS) — should be DROPPED
//   L2_OUT   =  3  m2 → SS     outside virtual segment for the m2↔m3 cross-boundary link
//   L3_IN    =  4  SS → m3     inside virtual segment for the m2↔m3 cross-boundary link
//   L4_RAW   =  5  m3 → m4     non-boundary raw link inside SS — should be PLACED at SS level
//   L5_OUT   =  6  m4 → SS1    outside virtual segment for the m4↔m5 cross-boundary link
//   L6_IN    =  7  SS1 → m5    inside virtual segment for the m4↔m5 cross-boundary link
//   L7_RAW   =  8  m5 → m6     non-boundary raw link inside SS1
//   L4_RAW2  =  9  m4 → m5     boundary-crossing raw link (m5 inside SS1) — should be DROPPED
// =============================================================================
const L1_RAW = makeDataLink(1, M1, M2);
const L2_RAW = makeDataLink(2, M2, M3); // boundary-crossing — dropped by levelNodeIds
const L2_OUT = makeDataLink(3, M2, SS); // outside virtual segment, placed at root
const L3_IN = makeDataLink(4, SS, M3); // inside virtual segment, placed at SS level
const L4_RAW = makeDataLink(5, M3, M4); // non-boundary raw inside SS, placed at SS level
const L5_OUT = makeDataLink(6, M4, SS1); // outside virtual for SS1, placed at SS level
const L6_IN = makeDataLink(7, SS1, M5); // inside virtual for SS1, placed at SS1 level
const L7_RAW = makeDataLink(8, M5, M6); // non-boundary raw inside SS1
const L4_RAW2 = makeDataLink(9, M4, M5); // boundary-crossing raw into SS1 — dropped

// =============================================================================
// Scenario A (initial state): m1 → m2 → SS( m3 → m4 )
//
// Flat input supplied to buildSubsystemTree — mirrors what the handler assembles
// after combining raw links (Pass 2a) with filtered virtual segments (Pass 2b).
// L2_RAW is included intentionally to verify it is dropped at every level.
// =============================================================================
const INITIAL_FLAT = {
  modules: [
    makeModule(M1), // parentId = undefined → top level
    makeModule(M2), // parentId = undefined → top level
    makeModule(M3, SS), // parentId = SS        → inside SS
    makeModule(M4, SS), // parentId = SS        → inside SS
  ],
  dataLinks: [
    L1_RAW, // m1→m2  — non-boundary top-level
    L2_RAW, // m2→m3  — boundary-crossing raw (expected to be dropped by levelNodeIds)
    L2_OUT, // m2→SS  — outside virtual segment (expected at root level)
    L3_IN, // SS→m3  — inside virtual segment  (expected at SS level)
    L4_RAW, // m3→m4  — non-boundary raw inside SS (expected at SS level)
  ],
  controlLinks: [],
};

const INITIAL_SUBSYSTEMS = [makeSub(SS)]; // SS is a root subsystem (no parent)

// =============================================================================
// Scenario B (after adding SS1): m1 → m2 → SS( m3 → m4 → SS1( m5 → m6 ) )
//
// The handler has applied the edit-session overlay so findAll returns [SS, SS1]
// and the virtual segment service returns segments covering SS1's boundary.
// L4_RAW2 (m4→m5 raw) is included to verify it is dropped — the virtual
// segments L5_OUT / L6_IN are what represent that connection in the tree.
// =============================================================================
const SS1_ADDED_FLAT = {
  modules: [
    makeModule(M1),
    makeModule(M2),
    makeModule(M3, SS),
    makeModule(M4, SS),
    makeModule(M5, SS1), // new module inside SS1
    makeModule(M6, SS1), // new module inside SS1
  ],
  dataLinks: [
    L1_RAW, // m1→m2     non-boundary top-level
    L2_RAW, // m2→m3     boundary-crossing raw (dropped)
    L2_OUT, // m2→SS     outside virtual (root level)
    L3_IN, // SS→m3     inside virtual (SS level)
    L4_RAW, // m3→m4     non-boundary raw inside SS
    L4_RAW2, // m4→m5     boundary-crossing raw into SS1 (dropped)
    L5_OUT, // m4→SS1    outside virtual for SS1 (SS level)
    L6_IN, // SS1→m5    inside virtual for SS1 (SS1 level)
    L7_RAW, // m5→m6     non-boundary raw inside SS1
  ],
  controlLinks: [],
};

const SS1_ADDED_SUBSYSTEMS = [
  makeSub(SS), // root subsystem, unchanged
  makeSub(SS1, SS), // new subsystem nested inside SS
];

// =============================================================================
// Tests
// =============================================================================

describe('buildSubsystemTree', () => {
  // ---------------------------------------------------------------------------
  // Scenario 1 — No subsystems: all modules and links stay at the root level
  //
  // When subsystems = [], buildSubsystemTree has no children to recurse into.
  // Every module is a top-level module (parentId = undefined) and every link
  // has both endpoints visible at the root level, so nothing is dropped and
  // the result is a flat root-only structure.
  // ---------------------------------------------------------------------------
  describe('Scenario 1 — no subsystems: all content stays at root', () => {
    it('returns all modules at root and no subsystem nodes', () => {
      const result = buildSubsystemTree(
        {
          modules: [makeModule(M1), makeModule(M2)],
          dataLinks: [L1_RAW], // m1→m2 non-boundary, both top-level
          controlLinks: [],
        },
        [], // no subsystems in the file
      );

      // All modules land at root because parentId = undefined
      expect(result.modules.map(m => m.systemId)).toEqual([M1, M2]);

      // The m1→m2 link is placed at root — both endpoints are top-level modules
      // (category 1 of levelNodeIds) so the filter passes it through
      expect(linkIds(result.dataLinks)).toEqual([L1_RAW.systemId]);

      // No subsystem nodes generated
      expect(result.subsystems).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2 — Initial state: m1 → m2 → SS( m3 → m4 )
  //
  // Key things being verified:
  //
  //   a) Module placement: m1/m2 at root (parentId=undefined),
  //      m3/m4 at SS level (parentId=SS).
  //
  //   b) Non-boundary raw link (L1_RAW: m1→m2) is placed at root level — both
  //      endpoints are top-level modules (category 1 of levelNodeIds at root).
  //
  //   c) Boundary-crossing raw link (L2_RAW: m2→m3) is DROPPED from the output
  //      entirely — at root level m3 is not visible, and at SS level m2 is not
  //      visible. The levelNodeIds predicate rejects it at both levels.
  //
  //   d) Outside virtual segment (L2_OUT: m2→SS) is placed at root — m2 is a
  //      direct module child (category 1) and SS is a direct child subsystem
  //      (category 2) at the root level.
  //
  //   e) Inside virtual segment (L3_IN: SS→m3) is placed at SS level — SS is
  //      the subsystem's own ID (category 3) and m3 is a direct module child
  //      (category 1) at the SS level.
  //
  //   f) Non-boundary raw link (L4_RAW: m3→m4) is placed at SS level — both
  //      m3 and m4 are direct module children of SS (category 1 at SS level).
  // ---------------------------------------------------------------------------
  describe('Scenario 2 — initial state: SS containing m3 and m4', () => {
    let result: ReturnType<typeof buildSubsystemTree>;

    beforeAll(() => {
      result = buildSubsystemTree(INITIAL_FLAT, INITIAL_SUBSYSTEMS);
    });

    it('places m1 and m2 at the root level (parentId = undefined)', () => {
      expect(result.modules.map(m => m.systemId).sort()).toEqual([M1, M2]);
    });

    it('places the non-boundary raw link L1_RAW (m1→m2) at root level', () => {
      expect(linkIds(result.dataLinks)).toContain(L1_RAW.systemId);
    });

    it('places the outside virtual segment L2_OUT (m2→SS) at root level', () => {
      // L2_OUT has src=M2 (cat-1: direct module child) and dst=SS (cat-2: direct
      // child subsystem), so both endpoints are in root-level levelNodeIds.
      expect(linkIds(result.dataLinks)).toContain(L2_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) from root level', () => {
      // m3 is inside SS — its systemId is not in root-level levelNodeIds.
      // The levelNodeIds filter rejects the link at root (m3 not visible) and at
      // SS level (m2 not visible), so it does not appear in any output level.
      expect(linkIds(result.dataLinks)).not.toContain(L2_RAW.systemId);
    });

    it('creates exactly one subsystem node (SS) at the root', () => {
      expect(result.subsystems).toHaveLength(1);
      expect(result.subsystems[0].systemId).toBe(SS);
    });

    it('places m3 and m4 inside SS children (parentId = SS)', () => {
      const ssChildren = result.subsystems[0].children;
      expect(ssChildren.modules.map(m => m.systemId).sort()).toEqual([M3, M4]);
    });

    it('places the inside virtual segment L3_IN (SS→m3) at SS level', () => {
      // SS.systemId = category 3 (this subsystem's own ID) and m3 = category 1
      // (direct module child) in the SS-level levelNodeIds set.
      const ssChildren = result.subsystems[0].children;
      expect(linkIds(ssChildren.dataLinks)).toContain(L3_IN.systemId);
    });

    it('places the non-boundary raw link L4_RAW (m3→m4) at SS level', () => {
      // Both m3 and m4 are direct module children of SS (category 1 at SS level).
      const ssChildren = result.subsystems[0].children;
      expect(linkIds(ssChildren.dataLinks)).toContain(L4_RAW.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) from SS level', () => {
      // m2 is not inside SS, so it is not in the SS-level levelNodeIds set.
      const ssChildren = result.subsystems[0].children;
      expect(linkIds(ssChildren.dataLinks)).not.toContain(L2_RAW.systemId);
    });

    it('SS has no nested subsystems', () => {
      expect(result.subsystems[0].children.subsystems).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3 — Edit session adds SS1: m1 → m2 → SS( m3 → m4 → SS1( m5 → m6 ) )
  //
  // After the edit session overlay runs, the handler assembles:
  //   - findAll() returns [SS, SS1(parentId=SS)]
  //   - findByUsecaseIds (modules) returns m1..m6
  //   - virtual segment service returns segments for BOTH boundaries (m2→SS and m4→SS1)
  //
  // Key things being verified:
  //
  //   a) SS1 appears nested inside SS in the tree — buildSubsystemTree recurses
  //      into SS and finds SS1 as a direct child of SS (parentId=SS).
  //
  //   b) m5 and m6 are placed inside SS1 (parentId = SS1).
  //
  //   c) Outside virtual segment for SS1 (L5_OUT: m4→SS1) is placed at SS level —
  //      m4 is a direct module child of SS (category 1) and SS1 is a direct child
  //      subsystem of SS (category 2) at the SS level.
  //
  //   d) Inside virtual segment for SS1 (L6_IN: SS1→m5) is placed at SS1 level —
  //      SS1 is the subsystem's own ID (category 3) and m5 is a direct module child
  //      (category 1) at the SS1 level.
  //
  //   e) Non-boundary raw link L7_RAW (m5→m6) is placed at SS1 level — both
  //      m5 and m6 are direct module children of SS1 (category 1).
  //
  //   f) Boundary-crossing raw link L4_RAW2 (m4→m5) is DROPPED — at SS level
  //      m5 is not visible (m5 is inside SS1, not a direct child of SS), and at
  //      SS1 level m4 is not visible.  The virtual pair L5_OUT/L6_IN represents
  //      this connection at the correct levels instead.
  //
  //   g) All original links from scenario 2 remain at their correct levels
  //      (the new subsystem does not disturb existing placements).
  // ---------------------------------------------------------------------------
  describe('Scenario 3 — edit session adds SS1 nested inside SS', () => {
    let result: ReturnType<typeof buildSubsystemTree>;

    beforeAll(() => {
      result = buildSubsystemTree(SS1_ADDED_FLAT, SS1_ADDED_SUBSYSTEMS);
    });

    it('root still contains only m1 and m2', () => {
      expect(result.modules.map(m => m.systemId).sort()).toEqual([M1, M2]);
    });

    it('root dataLinks still contains L1_RAW and L2_OUT, nothing new', () => {
      expect(linkIds(result.dataLinks)).toEqual(
        [L1_RAW.systemId, L2_OUT.systemId].sort((a, b) => a - b),
      );
    });

    it('SS still contains only m3 and m4 as direct modules', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.modules.map(m => m.systemId).sort()).toEqual([M3, M4]);
    });

    it('places the outside virtual segment L5_OUT (m4→SS1) at SS level', () => {
      // m4 is a direct module child of SS (category 1) and SS1 is a direct
      // child subsystem of SS (category 2) — both visible at the SS level.
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(linkIds(ss.children.dataLinks)).toContain(L5_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L4_RAW2 (m4→m5) at SS level', () => {
      // m5 is inside SS1, not a direct child of SS — not in SS-level levelNodeIds.
      // The levelNodeIds filter drops L4_RAW2 here; L5_OUT/L6_IN take its place.
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(linkIds(ss.children.dataLinks)).not.toContain(L4_RAW2.systemId);
    });

    it('drops the boundary-crossing raw link L4_RAW2 (m4→m5) at SS1 level too', () => {
      // m4 is not inside SS1, so it is not in SS1-level levelNodeIds either.
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems.find(s => s.systemId === SS1)!;
      expect(linkIds(ss1.children.dataLinks)).not.toContain(L4_RAW2.systemId);
    });

    it('SS has exactly one child subsystem: SS1', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.subsystems).toHaveLength(1);
      expect(ss.children.subsystems[0].systemId).toBe(SS1);
    });

    it('SS1 contains m5 and m6 as direct modules', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems[0];
      expect(ss1.children.modules.map(m => m.systemId).sort()).toEqual([
        M5,
        M6,
      ]);
    });

    it('places the inside virtual segment L6_IN (SS1→m5) at SS1 level', () => {
      // SS1.systemId = category 3 (this subsystem's own boundary ID) and
      // m5 = category 1 (direct module child) in SS1-level levelNodeIds.
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems[0];
      expect(linkIds(ss1.children.dataLinks)).toContain(L6_IN.systemId);
    });

    it('places the non-boundary raw link L7_RAW (m5→m6) at SS1 level', () => {
      // Both m5 and m6 are direct module children of SS1 (category 1 at SS1 level).
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems[0];
      expect(linkIds(ss1.children.dataLinks)).toContain(L7_RAW.systemId);
    });

    it('SS1 has no nested subsystems', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems[0];
      expect(ss1.children.subsystems).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4 — Edit session deletes SS1: tree reverts to SS( m3, m4 ) only
  //
  // After the edit session overlay removes SS1, the handler assembles:
  //   - findAll() returns only [SS] — SS1 has been removed by overlay
  //   - modules returns only [m1..m4] — m5 and m6 have also been removed
  //   - virtual segments contain no SS1 boundary rows
  //
  // In this test we model the "modules deleted from scope" path by passing
  // SS1 in the subsystems list but with NO modules inside it.
  // This exercises the pruning rule (QWS-08): a subsystem with no in-scope
  // module at or beneath it is omitted from the output tree entirely.
  //
  // Key things being verified:
  //
  //   a) SS1 is present in the subsystems input but is PRUNED because
  //      hasInScopeDescendant(SS1) returns false (no module has parentId = SS1).
  //
  //   b) SS still appears and contains m3/m4 exactly as in the initial state.
  //
  //   c) No SS1 boundary virtual segments (L5_OUT, L6_IN) are in the flat input,
  //      so SS-level dataLinks contain only L3_IN and L4_RAW (initial state).
  // ---------------------------------------------------------------------------
  describe('Scenario 4 — edit session deletes SS1: pruning removes it from tree', () => {
    it('prunes SS1 when no in-scope module lives inside it', () => {
      // SS1 is still listed in the subsystem definitions but the overlay has
      // removed all its modules — modules[] contains only m1..m4.
      const result = buildSubsystemTree(INITIAL_FLAT, [
        makeSub(SS),
        makeSub(SS1, SS), // SS1 present in file definitions but has no in-scope modules
      ]);

      // SS1 must not appear anywhere in the output
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.subsystems).toHaveLength(0); // SS1 was pruned
    });

    it('SS still contains m3 and m4 after SS1 is pruned', () => {
      const result = buildSubsystemTree(INITIAL_FLAT, [
        makeSub(SS),
        makeSub(SS1, SS),
      ]);

      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.modules.map(m => m.systemId).sort()).toEqual([M3, M4]);
    });

    it('SS-level dataLinks are unchanged after SS1 is pruned', () => {
      const result = buildSubsystemTree(INITIAL_FLAT, [
        makeSub(SS),
        makeSub(SS1, SS),
      ]);

      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(linkIds(ss.children.dataLinks)).toEqual(
        [L3_IN.systemId, L4_RAW.systemId].sort((a, b) => a - b),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5 — Structural ancestor: SS_A → SS_B → m_deep
  //
  // SS_A has no direct modules of its own but has an in-scope module (M_DEEP)
  // nested two levels deep inside SS_B.  The pruning predicate must recursively
  // descend into SS_B to find M_DEEP and keep SS_A in the output even though
  // SS_A.modules = [].
  //
  // Per QWS-08: "Ancestor subsystems that are purely on the path to in-scope
  // modules appear with modules: [] and empty links."
  //
  // Key things being verified:
  //
  //   a) hasInScopeDescendant(SS_A) recurses into SS_B, finds M_DEEP →
  //      returns true → SS_A is NOT pruned.
  //
  //   b) SS_A appears in the output but with modules = [] and dataLinks = []
  //      (it has no direct children of its own).
  //
  //   c) SS_B appears nested inside SS_A with M_DEEP as its only module.
  // ---------------------------------------------------------------------------
  describe('Scenario 5 — structural ancestor: SS_A contains SS_B which contains a module', () => {
    it('keeps SS_A despite having no direct modules', () => {
      const result = buildSubsystemTree(
        {
          modules: [makeModule(M_DEEP, SS_B)], // only module is 2 levels deep
          dataLinks: [],
          controlLinks: [],
        },
        [
          makeSub(SS_A), // root subsystem — no direct modules
          makeSub(SS_B, SS_A), // child of SS_A — has M_DEEP directly inside it
        ],
      );

      expect(result.subsystems).toHaveLength(1);
      expect(result.subsystems[0].systemId).toBe(SS_A);
    });

    it('SS_A has empty modules and dataLinks arrays at its own level', () => {
      const result = buildSubsystemTree(
        {modules: [makeModule(M_DEEP, SS_B)], dataLinks: [], controlLinks: []},
        [makeSub(SS_A), makeSub(SS_B, SS_A)],
      );

      const ssA = result.subsystems[0];
      expect(ssA.children.modules).toHaveLength(0);
      expect(ssA.children.dataLinks).toHaveLength(0);
    });

    it('SS_B is nested inside SS_A and contains M_DEEP', () => {
      const result = buildSubsystemTree(
        {modules: [makeModule(M_DEEP, SS_B)], dataLinks: [], controlLinks: []},
        [makeSub(SS_A), makeSub(SS_B, SS_A)],
      );

      const ssA = result.subsystems[0];
      expect(ssA.children.subsystems).toHaveLength(1);
      const ssB = ssA.children.subsystems[0];
      expect(ssB.systemId).toBe(SS_B);
      expect(ssB.children.modules.map(m => m.systemId)).toEqual([M_DEEP]);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6 — Control links follow the same levelNodeIds placement rule
  //
  // The same 3-category levelNodeIds set that routes data links also routes
  // control links.  This scenario verifies:
  //   CL_RAW  (m1↔m2, top-level) → placed at root
  //   CL_RAW2 (m3↔m4, inside SS) → placed at SS level
  //   CL_OUT  (m2↔SS, outside virtual) → placed at root
  //   CL_IN   (SS↔m3, inside virtual) → placed at SS level
  //   CL_BC   (m2↔m3, boundary-crossing raw) → dropped at every level
  // ---------------------------------------------------------------------------
  describe('Scenario 6 — control links obey the same levelNodeIds rule as data links', () => {
    const CL_RAW = makeControlLink(10, M1, M2); // non-boundary top-level
    const CL_BC = makeControlLink(11, M2, M3); // boundary-crossing raw — dropped
    const CL_OUT = makeControlLink(12, M2, SS); // outside virtual — root level
    const CL_IN = makeControlLink(13, SS, M3); // inside virtual — SS level
    const CL_RAW2 = makeControlLink(14, M3, M4); // non-boundary raw inside SS

    it('places non-boundary control link at root and at SS level correctly', () => {
      const result = buildSubsystemTree(
        {
          modules: [
            makeModule(M1),
            makeModule(M2),
            makeModule(M3, SS),
            makeModule(M4, SS),
          ],
          dataLinks: [],
          controlLinks: [CL_RAW, CL_BC, CL_OUT, CL_IN, CL_RAW2],
        },
        [makeSub(SS)],
      );

      // Root: CL_RAW (m1↔m2 both cat-1) and CL_OUT (m2=cat-1, SS=cat-2)
      const rootClIds = result.controlLinks.map(cl => cl.systemId);
      expect(rootClIds).toContain(CL_RAW.systemId);
      expect(rootClIds).toContain(CL_OUT.systemId);
      expect(rootClIds).not.toContain(CL_BC.systemId); // m3 not visible at root

      // SS level: CL_IN (SS=cat-3, m3=cat-1) and CL_RAW2 (m3+m4 both cat-1)
      const ssClIds = result.subsystems[0].children.controlLinks.map(
        cl => cl.systemId,
      );
      expect(ssClIds).toContain(CL_IN.systemId);
      expect(ssClIds).toContain(CL_RAW2.systemId);
      expect(ssClIds).not.toContain(CL_BC.systemId); // m2 not visible at SS level
    });
  });
});
