/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest, describe, it, expect, beforeEach} from '@jest/globals';
import {GetComponentsWithSubsystemsHandler} from '../../../../../../src/application/usecase-designer/usecase/get-component-with-subsystem/get-components-with-subsystems.handler.js';
import {GetComponentsWithSubsystemsQuery} from '../../../../../../src/application/usecase-designer/usecase/get-component-with-subsystem/get-components-with-subsystems.query.js';
import {COMPONENT_SCOPE_TYPE} from '../../../../../../src/application/usecase-designer/usecase/get-components/component-scope-type.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {SpfModuleReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {DataLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/link/control-link-read-model.js';
import type {SubsystemReadModel} from '../../../../../../src/application/ports/persistence/query-services/subsystem/subsystem-read-model.js';
import {UseCaseReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';

// =============================================================================
// Fixed IDs — mirrors the build-subsystem-tree.spec.ts topology so that the
// two test files tell the same story end-to-end.
//
// Topology across all scenarios:
//
//   Top-level:        M1, M2
//   Inside SS:        M3, M4
//   Inside SS1:       M5, M6   ← added in H4 (edit session add), absent in H5 (delete)
//
//   SS  = root subsystem (parentId = undefined)
//   SS1 = child of SS   (parentId = SS)       ← injected by overlay in H4, absent in H5
//
//   UC  = the usecase systemId used in all queries
//   FILE_ID = the fileId returned by projectQueryService
//   PROJECT_ID = the projectId used in the query
// =============================================================================
const M1 = 10,
  M2 = 20,
  M3 = 30,
  M4 = 40,
  M5 = 50,
  M6 = 60;
const SS = 100,
  SS1 = 200;
const UC = 1,
  FILE_ID = 5,
  PROJECT_ID = 42;
const BASE_PORT = 5000;

// =============================================================================
// Minimal factories
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

// =============================================================================
// Link constants — same logical link set as build-subsystem-tree.spec.ts
//
// Raw links (from dataLinkQueryService.findByUsecaseIds):
//   L1_RAW  (1):  m1→m2   non-boundary, top-level
//   L2_RAW  (2):  m2→m3   boundary-crossing raw — DROPPED by buildSubsystemTree
//   L4_RAW  (5):  m3→m4   non-boundary raw inside SS — placed at SS level
//   L4_RAW2 (9):  m4→m5   boundary-crossing raw into SS1 — DROPPED
//   L7_RAW  (8):  m5→m6   non-boundary raw inside SS1 — placed at SS1 level
//
// Virtual segments (from subsystemQueryService.findDataLinkSegmentsByUsecaseIds):
//   L2_OUT  (3):  m2→SS   outside virtual — passes handler filter (SS is a subsystem)
//   L3_IN   (4):  SS→m3   inside virtual  — passes handler filter (SS is a subsystem)
//   L4_VIRT (20): m3→m4   non-boundary virtual — FILTERED OUT by handler (no subsystem endpoint)
//   L5_OUT  (6):  m4→SS1  outside virtual for SS1 — passes handler filter (SS1 is a subsystem)
//   L6_IN   (7):  SS1→m5  inside virtual for SS1  — passes handler filter (SS1 is a subsystem)
//   L7_VIRT (21): m5→m6   non-boundary virtual — FILTERED OUT by handler (no subsystem endpoint)
//
// The two-layer filtering is:
//   1. Handler layer: drops virtual segments whose both endpoints are module IDs
//      (the subsystem-endpoint filter: subsystemIds.has(src) || subsystemIds.has(dst))
//   2. buildSubsystemTree layer: drops boundary-crossing raw links whose endpoints
//      are never both visible in the same levelNodeIds set
// =============================================================================
const L1_RAW = makeDataLink(1, M1, M2);
const L2_RAW = makeDataLink(2, M2, M3); // boundary-crossing raw — dropped by tree builder
const L2_OUT = makeDataLink(3, M2, SS); // outside virtual — passes handler filter
const L3_IN = makeDataLink(4, SS, M3); // inside virtual  — passes handler filter
const L4_RAW = makeDataLink(5, M3, M4); // non-boundary raw inside SS
const L5_OUT = makeDataLink(6, M4, SS1); // outside virtual for SS1
const L6_IN = makeDataLink(7, SS1, M5); // inside virtual for SS1
const L7_RAW = makeDataLink(8, M5, M6); // non-boundary raw inside SS1
const L4_RAW2 = makeDataLink(9, M4, M5); // boundary-crossing raw into SS1 — dropped
const L4_VIRT = makeDataLink(20, M3, M4); // non-boundary virtual — filtered by handler
const L7_VIRT = makeDataLink(21, M5, M6); // non-boundary virtual — filtered by handler

// =============================================================================
// QueryServices factory
//
// Every method is a jest.fn() so tests can assert call/no-call behaviour.
// Defaults represent the happy-path initial state (SS only, m1..m4, no SS1).
// Override individual properties for deviation scenarios.
//
// The subsystemQueryService stub deliberately includes a non-boundary virtual
// segment (L4_VIRT) in findDataLinkSegmentsByUsecaseIds so that H3 can assert
// the handler filters it out before passing the flat model to buildSubsystemTree.
// =============================================================================
type ServiceOverrides = {
  fileId?: number;
  usecases?: UseCaseReadModel[];
  modules?: SpfModuleReadModel[];
  subsystems?: SubsystemReadModel[];
  rawDataLinks?: DataLinkReadModel[];
  rawControlLinks?: ControlLinkReadModel[];
  virtualDataLinks?: DataLinkReadModel[];
  virtualControlLinks?: ControlLinkReadModel[];
};

function makeServices(overrides: ServiceOverrides = {}): QueryServices {
  const {
    fileId = FILE_ID,
    usecases = [new UseCaseReadModel(UC, [])],
    modules = [
      makeModule(M1),
      makeModule(M2),
      makeModule(M3, SS),
      makeModule(M4, SS),
    ],
    subsystems = [makeSub(SS)],
    rawDataLinks = [L1_RAW, L2_RAW, L4_RAW],
    rawControlLinks = [],
    virtualDataLinks = [L2_OUT, L3_IN, L4_VIRT],
    virtualControlLinks = [],
  } = overrides;

  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    useCaseQueryService: {
      getAllUseCases: jest.fn().mockResolvedValue(Result.ok(usecases)),
    },
    spfModuleQueryService: {
      findByUsecaseIds: jest.fn().mockResolvedValue(Result.ok(modules)),
    },
    subsystemQueryService: {
      findAll: jest.fn().mockResolvedValue(Result.ok(subsystems)),
      findDataLinkSegmentsByUsecaseIds: jest
        .fn()
        .mockResolvedValue(Result.ok(virtualDataLinks)),
      findControlLinkSegmentsByUsecaseIds: jest
        .fn()
        .mockResolvedValue(Result.ok(virtualControlLinks)),
    },
    dataLinkQueryService: {
      findByUsecaseIds: jest.fn().mockResolvedValue(Result.ok(rawDataLinks)),
    },
    controlLinkQueryService: {
      findByUsecaseIds: jest.fn().mockResolvedValue(Result.ok(rawControlLinks)),
    },
  } as unknown as QueryServices;
}

/** Builds the standard query for usecase UC under PROJECT_ID. */
function makeQuery(
  systemIds: number[] = [UC],
): GetComponentsWithSubsystemsQuery {
  return new GetComponentsWithSubsystemsQuery(
    {type: COMPONENT_SCOPE_TYPE.Usecase, systemIds},
    PROJECT_ID,
    'client-1',
  );
}

/** Extracts all dataLink systemIds from a tree node (flat helper for assertions). */
function collectDataLinkIds(node: {
  dataLinks: Array<{systemId: string | number}>;
}): number[] {
  return node.dataLinks.map(l => Number(l.systemId)).sort((a, b) => a - b);
}

// =============================================================================
// Tests
// =============================================================================

describe('GetComponentsWithSubsystemsHandler', () => {
  // ---------------------------------------------------------------------------
  // Scenario H1 — Invalid usecase ID throws Error
  //
  // The handler validates every requested systemId against the full usecase list
  // returned by getAllUseCases (which applies overlay, so session-created usecases
  // are included).  If any ID is not found, the handler throws an Error before
  // loading modules or links.  The controller calls toApiResult() which requires
  // handlers to throw on failure, never return Result.fail() — returning
  // Result.fail would produce a generic 500 from toApiResult's contract guard.
  //
  // Key things being verified:
  //   a) Handler throws when an unknown ID is in the request.
  //   b) Module and link query services are NOT called (fail-fast gate).
  // ---------------------------------------------------------------------------
  describe('Scenario H1 — invalid usecase ID: handler throws', () => {
    it('throws when a requested systemId is not in getAllUseCases', async () => {
      // getAllUseCases returns only UC=1; the query asks for 999 which is unknown.
      const services = makeServices({usecases: [new UseCaseReadModel(UC, [])]});
      const handler = new GetComponentsWithSubsystemsHandler(services);

      await expect(handler.handle(makeQuery([999]))).rejects.toThrow('999');
    });

    it('does not call module or link services when ID validation fails', async () => {
      const services = makeServices({usecases: [new UseCaseReadModel(UC, [])]});
      const handler = new GetComponentsWithSubsystemsHandler(services);

      await expect(handler.handle(makeQuery([999]))).rejects.toThrow();

      // The handler short-circuits at the validation gate — no expensive queries
      expect(
        services.spfModuleQueryService.findByUsecaseIds,
      ).not.toHaveBeenCalled();
      expect(
        services.dataLinkQueryService.findByUsecaseIds,
      ).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H2 — No subsystems: handler uses raw links only (QWS-04 fallback)
  //
  // When findAll() returns an empty array the handler skips virtual segment
  // loading entirely — virtual segment tables have no rows when there is no
  // subsystem context in the file.
  //
  // Key things being verified:
  //   a) dataLinkQueryService.findByUsecaseIds IS called (raw links always loaded).
  //   b) subsystemQueryService.findDataLinkSegmentsByUsecaseIds is NOT called.
  //   c) subsystemQueryService.findControlLinkSegmentsByUsecaseIds is NOT called.
  //   d) Result is ok and the tree has no subsystem nodes.
  //   e) All top-level modules appear at root and their links are placed correctly
  //      (no boundary logic needed since there are no subsystem nodes).
  // ---------------------------------------------------------------------------
  describe('Scenario H2 — no subsystems: raw links fetched, virtual segment services not called', () => {
    let services: QueryServices;

    beforeEach(() => {
      // No subsystems; all modules are top-level; only raw links are relevant.
      services = makeServices({
        subsystems: [],
        modules: [
          makeModule(M1),
          makeModule(M2),
          makeModule(M3),
          makeModule(M4),
        ],
        rawDataLinks: [L1_RAW],
      });
    });

    it('calls dataLinkQueryService.findByUsecaseIds (raw links always loaded)', async () => {
      await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
      expect(
        services.dataLinkQueryService.findByUsecaseIds,
      ).toHaveBeenCalledWith([UC], FILE_ID);
    });

    it('does NOT call findDataLinkSegmentsByUsecaseIds when no subsystems exist', async () => {
      await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
      expect(
        services.subsystemQueryService.findDataLinkSegmentsByUsecaseIds,
      ).not.toHaveBeenCalled();
    });

    it('does NOT call findControlLinkSegmentsByUsecaseIds when no subsystems exist', async () => {
      await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
      expect(
        services.subsystemQueryService.findControlLinkSegmentsByUsecaseIds,
      ).not.toHaveBeenCalled();
    });

    it('returns Result.ok with an empty subsystems array at root', async () => {
      const result = await new GetComponentsWithSubsystemsHandler(
        services,
      ).handle(makeQuery());
      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind === RESULT_KIND.Ok) {
        expect(result.data.subsystems).toHaveLength(0);
      }
    });

    it('all modules appear at root because there is no subsystem hierarchy', async () => {
      const result = await new GetComponentsWithSubsystemsHandler(
        services,
      ).handle(makeQuery());
      if (result.kind === RESULT_KIND.Ok) {
        expect(
          result.data.spfModules
            .map(m => Number(m.systemId))
            .sort((a, b) => a - b),
        ).toEqual([M1, M2, M3, M4]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H3 — Initial state SS( m3, m4 ): virtual segments fetched and combined
  //
  // This is the core two-layer filtering scenario.  The handler:
  //   Pass 2a — loads raw links (always): [L1_RAW, L2_RAW, L4_RAW]
  //   Pass 2b — loads virtual segments (hasSubsystems=true): [L2_OUT, L3_IN, L4_VIRT]
  //   Handler filter — keeps only virtual segments with a subsystem endpoint:
  //     L2_OUT passes  (dst=SS.systemId ∈ subsystemIds)
  //     L3_IN  passes  (src=SS.systemId ∈ subsystemIds)
  //     L4_VIRT drops  (src=M3, dst=M4 — neither is a subsystem ID)
  //   flat.dataLinks = [L1_RAW, L2_RAW, L4_RAW, L2_OUT, L3_IN]
  //
  // Then buildSubsystemTree applies levelNodeIds:
  //   Root level  (levelNodeIds = {M1,M2,SS}):
  //     L1_RAW passes   (M1=cat-1, M2=cat-1)
  //     L2_OUT passes   (M2=cat-1, SS=cat-2)
  //     L2_RAW dropped  (M3 not in levelNodeIds at root)
  //   SS level (levelNodeIds = {M3,M4,SS}):
  //     L4_RAW passes   (M3=cat-1, M4=cat-1)
  //     L3_IN  passes   (SS=cat-3, M3=cat-1)
  //     L2_RAW dropped  (M2 not in levelNodeIds at SS level)
  //     L4_VIRT absent  (was filtered by handler before reaching tree builder)
  //
  // Key things being verified:
  //   a) Virtual segment services ARE called when subsystems exist.
  //   b) The non-boundary virtual L4_VIRT (m3→m4) is filtered out by the handler
  //      and does NOT appear in the SS-level dataLinks.
  //   c) The boundary-crossing raw L2_RAW (m2→m3) is naturally dropped by the
  //      tree builder's levelNodeIds filter and does NOT appear at any level.
  //   d) The outside virtual L2_OUT appears at root, the inside virtual L3_IN
  //      and non-boundary raw L4_RAW appear at SS level.
  // ---------------------------------------------------------------------------
  describe('Scenario H3 — initial state SS(m3,m4): virtual segments fetched and combined with raw links', () => {
    let services: QueryServices;
    let result: Awaited<
      ReturnType<GetComponentsWithSubsystemsHandler['handle']>
    >;

    beforeEach(async () => {
      services = makeServices(); // defaults: SS only, m1..m4, rawDataLinks=[L1,L2_RAW,L4], virtualDataLinks=[L2_OUT,L3_IN,L4_VIRT]
      result = await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
    });

    it('calls findDataLinkSegmentsByUsecaseIds because subsystems exist (QWS-04)', () => {
      expect(
        services.subsystemQueryService.findDataLinkSegmentsByUsecaseIds,
      ).toHaveBeenCalledWith([UC], FILE_ID);
    });

    it('calls findControlLinkSegmentsByUsecaseIds because subsystems exist', () => {
      expect(
        services.subsystemQueryService.findControlLinkSegmentsByUsecaseIds,
      ).toHaveBeenCalledWith([UC], FILE_ID);
    });

    it('returns Result.ok', () => {
      expect(result.kind).toBe(RESULT_KIND.Ok);
    });

    it('places the non-boundary raw link L1_RAW (m1→m2) at root level', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).toContain(L1_RAW.systemId);
    });

    it('places the outside virtual segment L2_OUT (m2→SS) at root level', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).toContain(L2_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) — not visible at root', () => {
      // m3 is inside SS; its systemId is not in root-level levelNodeIds.
      // buildSubsystemTree drops this raw link because neither endpoint appears
      // in a single level's node ID set.
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).not.toContain(L2_RAW.systemId);
    });

    it('places the inside virtual segment L3_IN (SS→m3) at SS level', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).toContain(L3_IN.systemId);
    });

    it('places the non-boundary raw link L4_RAW (m3→m4) at SS level', () => {
      // L4_RAW is a raw link where both endpoints are direct modules of SS.
      // buildSubsystemTree places it at SS level (both in category 1 there).
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).toContain(L4_RAW.systemId);
    });

    it('does NOT place the non-boundary virtual L4_VIRT (m3→m4) at SS level', () => {
      // The handler's subsystem-endpoint filter drops L4_VIRT before passing
      // the flat model to buildSubsystemTree.  L4_VIRT has src=M3, dst=M4 —
      // neither is in subsystemIds = {SS.systemId} — so it is excluded from
      // extraDataLinks.  L4_RAW (same logical connection, raw source) covers it.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).not.toContain(L4_VIRT.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) at SS level too', () => {
      // m2 is not inside SS — it is not in SS-level levelNodeIds.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).not.toContain(L2_RAW.systemId);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H4 — Edit session adds SS1: SS1 appears in the tree
  //
  // After the edit session overlay has run, the query services reflect the new
  // state of the file:
  //   - subsystemQueryService.findAll() returns [SS, SS1(parentId=SS)]
  //   - spfModuleQueryService.findByUsecaseIds() returns m1..m6 (m5,m6 inside SS1)
  //   - findDataLinkSegmentsByUsecaseIds() returns the SS1 boundary segments
  //     plus the original SS segments
  //
  // Handler filter pass — virtual segments with a subsystem endpoint:
  //   L2_OUT passes  (dst=SS  ∈ {SS, SS1})
  //   L3_IN  passes  (src=SS  ∈ {SS, SS1})
  //   L5_OUT passes  (dst=SS1 ∈ {SS, SS1})
  //   L6_IN  passes  (src=SS1 ∈ {SS, SS1})
  //   L4_VIRT drops  (M3, M4  — no subsystem endpoint)
  //   L7_VIRT drops  (M5, M6  — no subsystem endpoint)
  //
  // buildSubsystemTree places links:
  //   Root:  L1_RAW, L2_OUT
  //   SS:    L3_IN, L4_RAW, L5_OUT     (L5_OUT: M4=cat-1, SS1=cat-2)
  //   SS1:   L6_IN, L7_RAW             (L6_IN: SS1=cat-3, M5=cat-1)
  //   Dropped: L2_RAW (boundary M2→M3), L4_RAW2 (boundary M4→M5)
  //
  // Key things being verified:
  //   a) SS1 appears as a child subsystem of SS.
  //   b) m5 and m6 are placed inside SS1.
  //   c) Outside virtual L5_OUT is placed at SS level and inside virtual L6_IN
  //      at SS1 level.
  //   d) Non-boundary raw L7_RAW (m5→m6) is placed at SS1 level.
  //   e) Boundary-crossing raw L4_RAW2 (m4→m5) is dropped by the tree builder.
  //   f) Non-boundary virtual L7_VIRT is filtered out by the handler.
  // ---------------------------------------------------------------------------
  describe('Scenario H4 — edit session adds SS1: new subsystem appears in tree', () => {
    let result: Awaited<
      ReturnType<GetComponentsWithSubsystemsHandler['handle']>
    >;

    beforeEach(async () => {
      const services = makeServices({
        subsystems: [makeSub(SS), makeSub(SS1, SS)],
        modules: [
          makeModule(M1),
          makeModule(M2),
          makeModule(M3, SS),
          makeModule(M4, SS),
          makeModule(M5, SS1),
          makeModule(M6, SS1), // new modules added by overlay
        ],
        rawDataLinks: [L1_RAW, L2_RAW, L4_RAW, L4_RAW2, L7_RAW],
        virtualDataLinks: [L2_OUT, L3_IN, L4_VIRT, L5_OUT, L6_IN, L7_VIRT],
      });
      result = await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
    });

    it('returns Result.ok', () => {
      expect(result.kind).toBe(RESULT_KIND.Ok);
    });

    it('SS1 appears as a child subsystem of SS', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(ss.children.subsystems.some(s => Number(s.systemId) === SS1)).toBe(
        true,
      );
    });

    it('m5 and m6 are placed inside SS1 (parentId = SS1)', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(
        ss1.children.spfModules
          .map(m => Number(m.systemId))
          .sort((a, b) => a - b),
      ).toEqual([M5, M6]);
    });

    it('places the outside virtual L5_OUT (m4→SS1) at SS level', () => {
      // m4 is a direct module child of SS (category 1) and SS1 is a direct
      // child subsystem of SS (category 2) — both visible at the SS level.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).toContain(L5_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L4_RAW2 (m4→m5) at SS level', () => {
      // m5 is inside SS1, not a direct child of SS — it is not in SS-level
      // levelNodeIds.  The virtual pair L5_OUT/L6_IN represents this connection.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).not.toContain(L4_RAW2.systemId);
    });

    it('places the inside virtual L6_IN (SS1→m5) at SS1 level', () => {
      // SS1.systemId = category 3 at SS1 level; m5 = category 1.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectDataLinkIds(ss1.children)).toContain(L6_IN.systemId);
    });

    it('places the non-boundary raw L7_RAW (m5→m6) at SS1 level', () => {
      // Both m5 and m6 are direct module children of SS1 (category 1).
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectDataLinkIds(ss1.children)).toContain(L7_RAW.systemId);
    });

    it('does NOT include the non-boundary virtual L7_VIRT (m5→m6) at SS1 level', () => {
      // The handler filters out L7_VIRT because neither M5 nor M6 is in
      // subsystemIds = {SS, SS1}.  L7_RAW (same connection, raw source) is used.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectDataLinkIds(ss1.children)).not.toContain(L7_VIRT.systemId);
    });

    it('drops the boundary-crossing raw L4_RAW2 (m4→m5) at SS1 level too', () => {
      // m4 is not inside SS1 — not in SS1-level levelNodeIds.
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectDataLinkIds(ss1.children)).not.toContain(L4_RAW2.systemId);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H5 — Edit session deletes SS1: tree reverts to initial state
  //
  // After the overlay removes SS1 and its modules (m5, m6), the query services
  // return the same data as the initial state:
  //   - findAll() returns only [SS]
  //   - findByUsecaseIds (modules) returns only m1..m4
  //   - findDataLinkSegmentsByUsecaseIds returns only the original SS segments
  //     (no L5_OUT, L6_IN, L7_VIRT — those belong to the now-deleted SS1)
  //   - Raw links return only L1_RAW, L2_RAW, L4_RAW (no L4_RAW2, L7_RAW)
  //
  // Key things being verified:
  //   a) SS1 does NOT appear in the tree (findAll returned only [SS]).
  //   b) SS still contains m3 and m4 as its only modules.
  //   c) SS-level dataLinks match the initial state: [L3_IN, L4_RAW].
  //   d) No remnants of SS1 (no L5_OUT, L6_IN, L7_RAW) appear anywhere.
  // ---------------------------------------------------------------------------
  describe('Scenario H5 — edit session deletes SS1: tree reverts to initial state', () => {
    let result: Awaited<
      ReturnType<GetComponentsWithSubsystemsHandler['handle']>
    >;

    beforeEach(async () => {
      // Services reflect post-overlay state: SS1 removed, m5/m6 removed,
      // no SS1 virtual segments.  Matches exactly the initial-state defaults.
      const services = makeServices(); // defaults already represent the initial state
      result = await new GetComponentsWithSubsystemsHandler(services).handle(
        makeQuery(),
      );
    });

    it('returns Result.ok', () => {
      expect(result.kind).toBe(RESULT_KIND.Ok);
    });

    it('SS has no child subsystems (SS1 is gone)', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(ss.children.subsystems).toHaveLength(0);
    });

    it('SS still contains only m3 and m4', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(
        ss.children.spfModules
          .map(m => Number(m.systemId))
          .sort((a, b) => a - b),
      ).toEqual([M3, M4]);
    });

    it('SS-level dataLinks contain L3_IN and L4_RAW — no SS1 segments', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ids = collectDataLinkIds(ss.children);
      expect(ids).toContain(L3_IN.systemId);
      expect(ids).toContain(L4_RAW.systemId);
      expect(ids).not.toContain(L5_OUT.systemId); // SS1 outside segment — gone
      expect(ids).not.toContain(L6_IN.systemId); // SS1 inside segment — gone
    });

    it('root-level dataLinks are unchanged: L1_RAW and L2_OUT only', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).toEqual(
        [L1_RAW.systemId, L2_OUT.systemId].sort((a, b) => a - b),
      );
    });

    it('m5 and m6 are not present anywhere in the tree', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const allModules = [...result.data.spfModules, ...ss.children.spfModules];
      const moduleIds = allModules.map(m => Number(m.systemId));
      expect(moduleIds).not.toContain(M5);
      expect(moduleIds).not.toContain(M6);
    });
  });
});
