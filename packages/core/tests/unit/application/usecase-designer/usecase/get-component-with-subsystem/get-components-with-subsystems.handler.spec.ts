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
import type {SubsystemDataLinkReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/subsystem-data-link-read-model.js';
import {UseCaseReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';

// =============================================================================
// Fixed IDs — mirrors the build-subsystem-tree.spec.ts topology.
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

// =============================================================================
// Link constants — same logical link set as build-subsystem-tree.spec.ts
//
// Raw links (from dataLinkQueryService.findByUsecaseIds) — mod-mod only:
//   L1_RAW  (1):  m1→m2   non-boundary, top-level
//   L2_RAW  (2):  m2→m3   boundary-crossing raw — DROPPED by buildSubsystemTree
//   L4_RAW  (5):  m3→m4   non-boundary raw inside SS — placed at SS dataLinks
//   L5_RAW  (9):  m4→m5   boundary-crossing raw into SS1 — DROPPED
//   L7_RAW  (8):  m5→m6   non-boundary raw inside SS1 — placed at SS1 dataLinks
//
// SLS segments (from subsystemQueryService.findDataLinkSegmentsByUsecaseIds):
//   SLS_L2_OUT (3):  m2→SS   outside SLS — placed at root subsystemDataLinks
//   SLS_L3_IN  (4):  SS→m3   inside SLS  — placed at SS subsystemDataLinks
//   SLS_L5_OUT (6):  m4→SS1  outside SLS for SS1 — placed at SS subsystemDataLinks
//   SLS_L6_IN  (7):  SS1→m5  inside SLS for SS1  — placed at SS1 subsystemDataLinks
// =============================================================================
const L1_RAW = makeDataLink(1, M1, M2);
const L2_RAW = makeDataLink(2, M2, M3); // boundary-crossing raw — dropped by tree builder
const L4_RAW = makeDataLink(5, M3, M4); // non-boundary raw inside SS
const L5_RAW = makeDataLink(9, M4, M5); // boundary-crossing raw into SS1 — dropped
const L7_RAW = makeDataLink(8, M5, M6); // non-boundary raw inside SS1

const SLS_L2_OUT = makeSlsSegment(3, M2, SS, L2_RAW.systemId); // outside SLS at root
const SLS_L3_IN = makeSlsSegment(4, SS, M3, L2_RAW.systemId); // inside SLS at SS level
const SLS_L5_OUT = makeSlsSegment(6, M4, SS1, L5_RAW.systemId); // outside SLS at SS
const SLS_L6_IN = makeSlsSegment(7, SS1, M5, L5_RAW.systemId); // inside SLS at SS1

// =============================================================================
// QueryServices factory
//
// Every method is a jest.fn() so tests can assert call/no-call behaviour.
// Defaults represent the happy-path initial state (SS only, m1..m4).
// virtualDataLinks is now SubsystemDataLinkReadModel[] — only true SLS segments,
// no non-boundary rows.  Override individual properties for deviation scenarios.
// =============================================================================
type ServiceOverrides = {
  fileId?: number;
  usecases?: UseCaseReadModel[];
  modules?: SpfModuleReadModel[];
  subsystems?: SubsystemReadModel[];
  rawDataLinks?: DataLinkReadModel[];
  rawControlLinks?: ControlLinkReadModel[];
  virtualDataLinks?: SubsystemDataLinkReadModel[];
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
    virtualDataLinks = [SLS_L2_OUT, SLS_L3_IN],
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

/** Extracts all dataLink systemIds from a tree node. */
function collectDataLinkIds(node: {
  dataLinks: Array<{systemId: string | number}>;
}): number[] {
  return node.dataLinks.map(l => Number(l.systemId)).sort((a, b) => a - b);
}

/** Extracts SLS segment systemIds (identified by parentSystemId being set) from a tree node. */
function collectSlsIds(node: {
  dataLinks: Array<{systemId: string | number; parentSystemId?: string}>;
}): number[] {
  return node.dataLinks
    .filter(l => l.parentSystemId !== undefined)
    .map(s => Number(s.systemId))
    .sort((a, b) => a - b);
}

/** Extracts pure module-to-module dataLink systemIds (no parentSystemId). */
function collectModLinkIds(node: {
  dataLinks: Array<{systemId: string | number; parentSystemId?: string}>;
}): number[] {
  return node.dataLinks
    .filter(l => l.parentSystemId === undefined)
    .map(l => Number(l.systemId))
    .sort((a, b) => a - b);
}

// =============================================================================
// Tests
// =============================================================================

describe('GetComponentsWithSubsystemsHandler', () => {
  // ---------------------------------------------------------------------------
  // Scenario H1 — Invalid usecase ID throws Error
  // ---------------------------------------------------------------------------
  describe('Scenario H1 — invalid usecase ID: handler throws', () => {
    it('throws when a requested systemId is not in getAllUseCases', async () => {
      const services = makeServices({usecases: [new UseCaseReadModel(UC, [])]});
      const handler = new GetComponentsWithSubsystemsHandler(services);

      await expect(handler.handle(makeQuery([999]))).rejects.toThrow('999');
    });

    it('does not call module or link services when ID validation fails', async () => {
      const services = makeServices({usecases: [new UseCaseReadModel(UC, [])]});
      const handler = new GetComponentsWithSubsystemsHandler(services);

      await expect(handler.handle(makeQuery([999]))).rejects.toThrow();

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
  // loading entirely.
  // ---------------------------------------------------------------------------
  describe('Scenario H2 — no subsystems: raw links fetched, virtual segment services not called', () => {
    let services: QueryServices;

    beforeEach(() => {
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
  // Scenario H3 — Initial state SS( m3, m4 ): SLS segments fetched and placed
  //
  // Handler flow:
  //   Pass 2a — loads raw links (always): [L1_RAW, L2_RAW, L4_RAW]
  //   Pass 2b — loads SLS segments (hasSubsystems=true): [SLS_L2_OUT, SLS_L3_IN]
  //   flat.dataLinks = [L1_RAW, L2_RAW, L4_RAW]  ← raw only, no SLS mixed in
  //   slsSegments    = [SLS_L2_OUT, SLS_L3_IN]
  //
  // buildSubsystemTree places links:
  //   Root dataLinks:          L1_RAW (m1/m2 both cat-1)
  //   Root subsystemDataLinks: SLS_L2_OUT (m2=cat-1, SS=cat-2)
  //   Root dropped:            L2_RAW (m3 not visible at root)
  //   SS dataLinks:            L4_RAW (m3+m4 both cat-1)
  //   SS subsystemDataLinks:   SLS_L3_IN (SS=cat-3, m3=cat-1)
  //   SS dropped:              L2_RAW (m2 not visible at SS level)
  //
  // Key things being verified:
  //   a) Virtual segment services ARE called when subsystems exist.
  //   b) SLS segments appear in subsystemDataLinks, not dataLinks.
  //   c) Boundary-crossing raw L2_RAW is dropped by the tree builder.
  // ---------------------------------------------------------------------------
  describe('Scenario H3 — initial state SS(m3,m4): SLS segments fetched and folded into dataLinks', () => {
    let services: QueryServices;
    let result: Awaited<
      ReturnType<GetComponentsWithSubsystemsHandler['handle']>
    >;

    beforeEach(async () => {
      services = makeServices(); // defaults: SS only, m1..m4, virtualDataLinks=[SLS_L2_OUT, SLS_L3_IN]
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

    it('places the non-boundary raw link L1_RAW (m1→m2) at root dataLinks', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectModLinkIds(result.data)).toContain(L1_RAW.systemId);
    });

    it('places the outside SLS segment SLS_L2_OUT (m2→SS) at root dataLinks with parentSystemId set', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectSlsIds(result.data)).toContain(SLS_L2_OUT.systemId);
    });

    it('SLS_L2_OUT IS in root dataLinks (folded into dataLinks array)', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).toContain(SLS_L2_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) — not visible at root', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectDataLinkIds(result.data)).not.toContain(L2_RAW.systemId);
    });

    it('places the inside SLS segment SLS_L3_IN (SS→m3) at SS dataLinks with parentSystemId set', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectSlsIds(ss.children)).toContain(SLS_L3_IN.systemId);
    });

    it('SLS_L3_IN IS in SS dataLinks (folded into dataLinks array)', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).toContain(SLS_L3_IN.systemId);
    });

    it('places the non-boundary raw link L4_RAW (m3→m4) at SS dataLinks', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectModLinkIds(ss.children)).toContain(L4_RAW.systemId);
    });

    it('drops the boundary-crossing raw link L2_RAW (m2→m3) at SS dataLinks too', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).not.toContain(L2_RAW.systemId);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H4 — Edit session adds SS1: SS1 appears in the tree
  //
  // After the edit session overlay has run:
  //   - subsystemQueryService.findAll() returns [SS, SS1(parentId=SS)]
  //   - spfModuleQueryService returns m1..m6 (m5,m6 inside SS1)
  //   - findDataLinkSegmentsByUsecaseIds() returns all 4 SLS segments
  //
  // buildSubsystemTree places links:
  //   Root dataLinks:         L1_RAW
  //   Root subsystemDataLinks: SLS_L2_OUT
  //   SS dataLinks:           L4_RAW
  //   SS subsystemDataLinks:  SLS_L3_IN, SLS_L5_OUT
  //   SS1 dataLinks:          L7_RAW
  //   SS1 subsystemDataLinks: SLS_L6_IN
  //   Dropped: L2_RAW (boundary M2→M3), L5_RAW (boundary M4→M5)
  //
  // Key things being verified:
  //   a) SS1 appears as a child subsystem of SS.
  //   b) m5 and m6 are placed inside SS1.
  //   c) SLS_L5_OUT appears at SS subsystemDataLinks, SLS_L6_IN at SS1 subsystemDataLinks.
  //   d) L5_RAW (boundary crossing) is dropped by the tree builder.
  //   e) L7_RAW (non-boundary inside SS1) is placed at SS1 dataLinks.
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
          makeModule(M6, SS1),
        ],
        rawDataLinks: [L1_RAW, L2_RAW, L4_RAW, L5_RAW, L7_RAW],
        virtualDataLinks: [SLS_L2_OUT, SLS_L3_IN, SLS_L5_OUT, SLS_L6_IN],
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

    it('places the outside SLS segment SLS_L5_OUT (m4→SS1) at SS dataLinks with parentSystemId set', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectSlsIds(ss.children)).toContain(SLS_L5_OUT.systemId);
    });

    it('drops the boundary-crossing raw link L5_RAW (m4→m5) at SS dataLinks', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectDataLinkIds(ss.children)).not.toContain(L5_RAW.systemId);
    });

    it('places the inside SLS segment SLS_L6_IN (SS1→m5) at SS1 dataLinks with parentSystemId set', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectSlsIds(ss1.children)).toContain(SLS_L6_IN.systemId);
    });

    it('places the non-boundary raw L7_RAW (m5→m6) at SS1 dataLinks', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectModLinkIds(ss1.children)).toContain(L7_RAW.systemId);
    });

    it('drops the boundary-crossing raw L5_RAW (m4→m5) at SS1 dataLinks too', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      const ss1 = ss.children.subsystems.find(s => Number(s.systemId) === SS1)!;
      expect(collectDataLinkIds(ss1.children)).not.toContain(L5_RAW.systemId);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario H5 — Edit session deletes SS1: tree reverts to initial state
  //
  // After the overlay removes SS1 and its modules (m5, m6), the query services
  // return the same data as the initial state (SS only, m1..m4).
  //
  // Key things being verified:
  //   a) SS1 does NOT appear in the tree (findAll returned only [SS]).
  //   b) SS still contains m3 and m4 as its only modules.
  //   c) SS-level dataLinks contains L4_RAW, subsystemDataLinks contains SLS_L3_IN.
  //   d) No remnants of SS1 (no SLS_L5_OUT, SLS_L6_IN, L7_RAW) appear anywhere.
  // ---------------------------------------------------------------------------
  describe('Scenario H5 — edit session deletes SS1: tree reverts to initial state', () => {
    let result: Awaited<
      ReturnType<GetComponentsWithSubsystemsHandler['handle']>
    >;

    beforeEach(async () => {
      // Services reflect post-overlay state: SS1 removed, m5/m6 removed,
      // no SS1 SLS segments.  Matches exactly the initial-state defaults.
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

    it('SS dataLinks contains L4_RAW (mod link) and SLS_L3_IN (SLS) — no SS1 segments', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      const ss = result.data.subsystems.find(s => Number(s.systemId) === SS)!;
      expect(collectModLinkIds(ss.children)).toEqual([L4_RAW.systemId]);
      expect(collectSlsIds(ss.children)).toEqual([SLS_L3_IN.systemId]);
      expect(collectSlsIds(ss.children)).not.toContain(SLS_L5_OUT.systemId);
      expect(collectSlsIds(ss.children)).not.toContain(SLS_L6_IN.systemId);
    });

    it('root-level dataLinks has L1_RAW (mod link) and SLS_L2_OUT (SLS) only', () => {
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(collectModLinkIds(result.data)).toEqual([L1_RAW.systemId]);
      expect(collectSlsIds(result.data)).toEqual([SLS_L2_OUT.systemId]);
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
