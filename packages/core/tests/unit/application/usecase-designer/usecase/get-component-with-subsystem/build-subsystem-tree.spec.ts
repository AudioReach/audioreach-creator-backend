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
import type {SubsystemDataLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/subsystem-data-link-read-model.js';
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

function makeSlsSegment(
  id: number,
  src: number,
  dst: number,
  parentLinkId: number | null = null,
): SubsystemDataLinkReadModel {
  return {
    systemId: id,
    sourceNodeSystemId: src,
    destinationNodeSystemId: dst,
    sourcePortSystemId: BASE_PORT + id,
    destinationPortSystemId: BASE_PORT + 100 + id,
    dataLinkSystemId: parentLinkId,
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
// Raw links come from dataLinkQueryService.findByUsecaseIds — always module-to-module.
// SLS segments come from subsystemQueryService.findDataLinkSegmentsByUsecaseIds —
// typed as SubsystemDataLinkReadModel[], passed to buildSubsystemTree as the 3rd arg.
//
// Raw link ID map:
//   L1_RAW   =  1  m1 → m2     non-boundary raw link at top level
//   L2_RAW   =  2  m2 → m3     boundary-crossing raw link (m3 inside SS) — should be DROPPED
//   L4_RAW   =  5  m3 → m4     non-boundary raw link inside SS — placed at SS level
//   L5_RAW   =  9  m4 → m5     boundary-crossing raw into SS1 — should be DROPPED
//   L7_RAW   =  8  m5 → m6     non-boundary raw link inside SS1
//
// SLS segment ID map:
//   SLS_L2_OUT (3):  m2 → SS   outside SLS segment for the m2↔m3 boundary link — placed at root
//   SLS_L3_IN  (4):  SS → m3   inside SLS segment for the m2↔m3 boundary link  — placed at SS level
//   SLS_L5_OUT (6):  m4 → SS1  outside SLS segment for the m4↔m5 boundary link — placed at SS level
//   SLS_L6_IN  (7):  SS1 → m5  inside SLS segment for the m4↔m5 boundary link  — placed at SS1 level
// =============================================================================
const L1_RAW = makeDataLink(1, M1, M2);
const L2_RAW = makeDataLink(2, M2, M3); // boundary-crossing — dropped by levelNodeIds
const L4_RAW = makeDataLink(5, M3, M4); // non-boundary raw inside SS
const L5_RAW = makeDataLink(9, M4, M5); // boundary-crossing raw into SS1 — dropped
const L7_RAW = makeDataLink(8, M5, M6); // non-boundary raw inside SS1

const SLS_L2_OUT = makeSlsSegment(3, M2, SS, L2_RAW.systemId); // outside SLS at root
const SLS_L3_IN = makeSlsSegment(4, SS, M3, L2_RAW.systemId); // inside SLS at SS level
const SLS_L5_OUT = makeSlsSegment(6, M4, SS1, L5_RAW.systemId); // outside SLS at SS level
const SLS_L6_IN = makeSlsSegment(7, SS1, M5, L5_RAW.systemId); // inside SLS at SS1 level

// =============================================================================
// Scenario A (initial state): m1 → m2 → SS( m3 → m4 )
//
// flat.dataLinks contains only raw mod-mod links.
// SLS segments are passed separately as the 3rd argument.
// L2_RAW is included to verify it is dropped at every level by levelNodeIds.
// =============================================================================
const INITIAL_FLAT = {
  modules: [
    makeModule(M1), // parentId = undefined → top level
    makeModule(M2), // parentId = undefined → top level
    makeModule(M3, SS), // parentId = SS        → inside SS
    makeModule(M4, SS), // parentId = SS        → inside SS
  ],
  dataLinks: [
    L1_RAW, // m1→m2  — non-boundary top-level raw link
    L2_RAW, // m2→m3  — boundary-crossing raw (expected to be dropped by levelNodeIds)
    L4_RAW, // m3→m4  — non-boundary raw inside SS
  ],
  controlLinks: [],
};

const INITIAL_SUBSYSTEMS = [makeSub(SS)]; // SS is a root subsystem (no parent)
const INITIAL_SLS = [SLS_L2_OUT, SLS_L3_IN]; // SLS segments for the m2↔m3 boundary

// =============================================================================
// Scenario B (after adding SS1): m1 → m2 → SS( m3 → m4 → SS1( m5 → m6 ) )
// =============================================================================
const SS1_ADDED_FLAT = {
  modules: [
    makeModule(M1),
    makeModule(M2),
    makeModule(M3, SS),
    makeModule(M4, SS),
    makeModule(M5, SS1),
    makeModule(M6, SS1),
  ],
  dataLinks: [
    L1_RAW, // m1→m2     non-boundary top-level
    L2_RAW, // m2→m3     boundary-crossing raw (dropped)
    L4_RAW, // m3→m4     non-boundary raw inside SS
    L5_RAW, // m4→m5     boundary-crossing raw into SS1 (dropped)
    L7_RAW, // m5→m6     non-boundary raw inside SS1
  ],
  controlLinks: [],
};

const SS1_ADDED_SUBSYSTEMS = [
  makeSub(SS), // root subsystem, unchanged
  makeSub(SS1, SS), // new subsystem nested inside SS
];
const SS1_ADDED_SLS = [
  SLS_L2_OUT, // outside SLS at root (m2→SS)
  SLS_L3_IN, // inside SLS at SS level (SS→m3)
  SLS_L5_OUT, // outside SLS at SS level (m4→SS1)
  SLS_L6_IN, // inside SLS at SS1 level (SS1→m5)
];

// =============================================================================
// Tests
// =============================================================================

describe('buildSubsystemTree', () => {
  // ---------------------------------------------------------------------------
  // Scenario 1 — No subsystems: all modules and links stay at the root level
  // ---------------------------------------------------------------------------
  describe('Scenario 1 — no subsystems: all content stays at root', () => {
    it('returns all modules at root and no subsystem nodes', () => {
      const result = buildSubsystemTree(
        {
          modules: [makeModule(M1), makeModule(M2)],
          dataLinks: [L1_RAW],
          controlLinks: [],
        },
        [], // no subsystems in the file
        [], // no SLS segments
      );

      expect(result.modules.map(m => m.systemId)).toEqual([M1, M2]);
      expect(linkIds(result.dataLinks)).toEqual([L1_RAW.systemId]);
      expect(result.subsystems).toHaveLength(0);
      expect(result.subsystemDataLinks).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2 — Initial state: m1 → m2 → SS( m3 → m4 )
  //
  // Key things being verified:
  //
  //   a) Module placement: m1/m2 at root, m3/m4 at SS level.
  //
  //   b) Non-boundary raw link (L1_RAW: m1→m2) is placed at root level dataLinks.
  //
  //   c) Boundary-crossing raw link (L2_RAW: m2→m3) is DROPPED entirely —
  //      at root level m3 is not visible, and at SS level m2 is not visible.
  //
  //   d) Outside SLS segment (SLS_L2_OUT: m2→SS) is placed at root subsystemDataLinks —
  //      m2 is a direct module child (category 1) and SS is a direct child subsystem
  //      (category 2) at the root level.
  //
  //   e) Inside SLS segment (SLS_L3_IN: SS→m3) is placed at SS subsystemDataLinks —
  //      SS is the subsystem's own ID (category 3) and m3 is a direct module child
  //      (category 1) at the SS level.
  //
  //   f) Non-boundary raw link (L4_RAW: m3→m4) is placed at SS level dataLinks —
  //      both m3 and m4 are direct module children of SS (category 1).
  // ---------------------------------------------------------------------------
  describe('Scenario 2 — initial state: SS containing m3 and m4', () => {
    let result: ReturnType<typeof buildSubsystemTree>;

    beforeAll(() => {
      result = buildSubsystemTree(
        INITIAL_FLAT,
        INITIAL_SUBSYSTEMS,
        INITIAL_SLS,
      );
    });

    it('places m1 and m2 at the root level (parentId = undefined)', () => {
      expect(result.modules.map(m => m.systemId).sort()).toEqual([M1, M2]);
    });

    it('places the non-boundary raw link L1_RAW (m1→m2) at root dataLinks', () => {
      expect(linkIds(result.dataLinks)).toContain(L1_RAW.systemId);
    });

    it('places the outside SLS segment SLS_L2_OUT (m2→SS) at root subsystemDataLinks', () => {
      expect(result.subsystemDataLinks.map(s => s.systemId)).toContain(
        SLS_L2_OUT.systemId,
      );
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) from root dataLinks', () => {
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

    it('places the inside SLS segment SLS_L3_IN (SS→m3) at SS subsystemDataLinks', () => {
      const ssChildren = result.subsystems[0].children;
      expect(ssChildren.subsystemDataLinks.map(s => s.systemId)).toContain(
        SLS_L3_IN.systemId,
      );
    });

    it('places the non-boundary raw link L4_RAW (m3→m4) at SS dataLinks', () => {
      const ssChildren = result.subsystems[0].children;
      expect(linkIds(ssChildren.dataLinks)).toContain(L4_RAW.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) from SS dataLinks', () => {
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
  // Key things being verified:
  //
  //   a) SS1 appears nested inside SS in the tree.
  //
  //   b) m5 and m6 are placed inside SS1 (parentId = SS1).
  //
  //   c) Outside SLS segment for SS1 (SLS_L5_OUT: m4→SS1) is placed at SS
  //      subsystemDataLinks — m4 is category 1 and SS1 is category 2 at SS level.
  //
  //   d) Inside SLS segment for SS1 (SLS_L6_IN: SS1→m5) is placed at SS1
  //      subsystemDataLinks — SS1 is category 3 and m5 is category 1 at SS1 level.
  //
  //   e) Non-boundary raw link L7_RAW (m5→m6) is placed at SS1 dataLinks.
  //
  //   f) Boundary-crossing raw link L5_RAW (m4→m5) is DROPPED — m5 is inside
  //      SS1 (not a direct child of SS) so it is never in any level's levelNodeIds.
  //
  //   g) All original links from scenario 2 remain at their correct levels.
  // ---------------------------------------------------------------------------
  describe('Scenario 3 — edit session adds SS1 nested inside SS', () => {
    let result: ReturnType<typeof buildSubsystemTree>;

    beforeAll(() => {
      result = buildSubsystemTree(
        SS1_ADDED_FLAT,
        SS1_ADDED_SUBSYSTEMS,
        SS1_ADDED_SLS,
      );
    });

    it('root still contains only m1 and m2', () => {
      expect(result.modules.map(m => m.systemId).sort()).toEqual([M1, M2]);
    });

    it('root dataLinks still contains only L1_RAW (no SLS at root changes)', () => {
      expect(linkIds(result.dataLinks)).toEqual([L1_RAW.systemId]);
    });

    it('root subsystemDataLinks contains SLS_L2_OUT only', () => {
      expect(result.subsystemDataLinks.map(s => s.systemId)).toEqual([
        SLS_L2_OUT.systemId,
      ]);
    });

    it('SS still contains only m3 and m4 as direct modules', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.modules.map(m => m.systemId).sort()).toEqual([M3, M4]);
    });

    it('places the outside SLS segment SLS_L5_OUT (m4→SS1) at SS subsystemDataLinks', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.subsystemDataLinks.map(s => s.systemId)).toContain(
        SLS_L5_OUT.systemId,
      );
    });

    it('drops the boundary-crossing raw link L5_RAW (m4→m5) at SS dataLinks', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(linkIds(ss.children.dataLinks)).not.toContain(L5_RAW.systemId);
    });

    it('drops the boundary-crossing raw link L5_RAW (m4→m5) at SS1 dataLinks too', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems.find(s => s.systemId === SS1)!;
      expect(linkIds(ss1.children.dataLinks)).not.toContain(L5_RAW.systemId);
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

    it('places the inside SLS segment SLS_L6_IN (SS1→m5) at SS1 subsystemDataLinks', () => {
      const ss = result.subsystems.find(s => s.systemId === SS)!;
      const ss1 = ss.children.subsystems[0];
      expect(ss1.children.subsystemDataLinks.map(s => s.systemId)).toContain(
        SLS_L6_IN.systemId,
      );
    });

    it('places the non-boundary raw link L7_RAW (m5→m6) at SS1 dataLinks', () => {
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
  // SS1 is present in the subsystems input but is PRUNED because
  // hasInScopeDescendant(SS1) returns false (no module has parentId = SS1).
  // ---------------------------------------------------------------------------
  describe('Scenario 4 — edit session deletes SS1: pruning removes it from tree', () => {
    it('prunes SS1 when no in-scope module lives inside it', () => {
      const result = buildSubsystemTree(
        INITIAL_FLAT,
        [
          makeSub(SS),
          makeSub(SS1, SS), // SS1 present in file definitions but has no in-scope modules
        ],
        INITIAL_SLS,
      );

      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.subsystems).toHaveLength(0); // SS1 was pruned
    });

    it('SS still contains m3 and m4 after SS1 is pruned', () => {
      const result = buildSubsystemTree(
        INITIAL_FLAT,
        [makeSub(SS), makeSub(SS1, SS)],
        INITIAL_SLS,
      );

      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(ss.children.modules.map(m => m.systemId).sort()).toEqual([M3, M4]);
    });

    it('SS-level dataLinks and subsystemDataLinks are unchanged after SS1 is pruned', () => {
      const result = buildSubsystemTree(
        INITIAL_FLAT,
        [makeSub(SS), makeSub(SS1, SS)],
        INITIAL_SLS,
      );

      const ss = result.subsystems.find(s => s.systemId === SS)!;
      expect(linkIds(ss.children.dataLinks)).toEqual([L4_RAW.systemId]);
      expect(ss.children.subsystemDataLinks.map(s => s.systemId)).toEqual([
        SLS_L3_IN.systemId,
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5 — Structural ancestor: SS_A → SS_B → m_deep
  //
  // SS_A has no direct modules of its own but has an in-scope module (M_DEEP)
  // nested two levels deep inside SS_B.  The pruning predicate must recursively
  // descend into SS_B to find M_DEEP and keep SS_A in the output.
  // ---------------------------------------------------------------------------
  describe('Scenario 5 — structural ancestor: SS_A contains SS_B which contains a module', () => {
    it('keeps SS_A despite having no direct modules', () => {
      const result = buildSubsystemTree(
        {
          modules: [makeModule(M_DEEP, SS_B)],
          dataLinks: [],
          controlLinks: [],
        },
        [
          makeSub(SS_A), // root subsystem — no direct modules
          makeSub(SS_B, SS_A), // child of SS_A — has M_DEEP directly inside it
        ],
        [], // no SLS segments
      );

      expect(result.subsystems).toHaveLength(1);
      expect(result.subsystems[0].systemId).toBe(SS_A);
    });

    it('SS_A has empty modules, dataLinks, and subsystemDataLinks at its own level', () => {
      const result = buildSubsystemTree(
        {modules: [makeModule(M_DEEP, SS_B)], dataLinks: [], controlLinks: []},
        [makeSub(SS_A), makeSub(SS_B, SS_A)],
        [],
      );

      const ssA = result.subsystems[0];
      expect(ssA.children.modules).toHaveLength(0);
      expect(ssA.children.dataLinks).toHaveLength(0);
      expect(ssA.children.subsystemDataLinks).toHaveLength(0);
    });

    it('SS_B is nested inside SS_A and contains M_DEEP', () => {
      const result = buildSubsystemTree(
        {modules: [makeModule(M_DEEP, SS_B)], dataLinks: [], controlLinks: []},
        [makeSub(SS_A), makeSub(SS_B, SS_A)],
        [],
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
  // The same 3-category levelNodeIds set that routes data links and SLS also
  // routes control links.  Virtual control link segments (boundary-crossing)
  // are still merged into flat.controlLinks by the handler (control link SLS
  // refactor is out of scope).
  //   CL_RAW  (m1↔m2, top-level) → placed at root controlLinks
  //   CL_RAW2 (m3↔m4, inside SS) → placed at SS controlLinks
  //   CL_OUT  (m2↔SS, outside virtual) → placed at root controlLinks
  //   CL_IN   (SS↔m3, inside virtual) → placed at SS controlLinks
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
        [], // no SLS segments
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
