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
} from '../../../../../src/domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {NodeType} from '../../../../../src/domain/entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubsystemControlLinkShape =
  ClearInput['remainingSubsystemControlLinks'][number];

function scl(
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
  nodeAPortSystemId: number,
  nodeBPortSystemId: number,
): SubsystemControlLinkShape {
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
  // ── Case A1: Delete module-end SubsystemControlLink from incomplete chain ─
  //
  // Before delete: M1(1) -scl1[p100-p200]- S(10) -scl2[p201-p300]- S(20)
  // After deleting scl1, remaining = [scl2 only].
  // Component { 10, 20 } has no module → clear ports 201, 300.
  describe('delete module-end SubsystemControlLink from incomplete chain', () => {
    it('clears all downstream subsystem ports in the now-unanchored component', () => {
      const input: ClearInput = {
        remainingSubsystemControlLinks: [scl(10, 20, 201, 300)],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
        ]),
        deletedSubsystemControlLink: {
          peerNodeASystemId: 1,
          peerNodeBSystemId: 10,
        },
      };

      const result: ClearResult =
        ControlIntentPropagationService.findPortsToClear(input);

      expect(sortedNumbers(result.portsToClear)).toEqual([201, 300]);
    });
  });

  // ── Case A2: Delete middle SubsystemControlLink of incomplete chain ───────
  //
  // Before: M1(1) -scl1[p100-p200]- S(10) -scl2[p201-p300]- S(20) -scl3[p301-p400]- S(30)
  // Delete scl2. Remaining = [scl1, scl3].
  //   Component A: { 1 (Module), 10 } — has module → keep ports 100, 200.
  //   Component B: { 20, 30 }         — no module  → clear ports 301, 400.
  describe('delete middle SubsystemControlLink of incomplete chain', () => {
    it('clears only the now-isolated downstream component, not the still-anchored side', () => {
      const input: ClearInput = {
        remainingSubsystemControlLinks: [
          scl(1, 10, 100, 200),
          scl(20, 30, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [30, 'subsystem'],
        ]),
        deletedSubsystemControlLink: {
          peerNodeASystemId: 10,
          peerNodeBSystemId: 20,
        },
      };

      const result = ControlIntentPropagationService.findPortsToClear(input);

      expect(sortedNumbers(result.portsToClear)).toEqual([301, 400]);
    });
  });

  // ── Case A3: Sibling SubsystemControlLink still reaches a module ──────────
  //
  // Before: scl1[1-10], scl2[10-2], scl3[10-20]
  // Delete scl3. Remaining = [scl1, scl2].
  // Component { 1(M), 10(S), 2(M) } still has modules → nothing cleared.
  // Node 20 has no remaining links → not reachable → nothing from it.
  describe('sibling SubsystemControlLink still reaches a module', () => {
    it('returns an empty portsToClear when the affected node retains a module path', () => {
      const input: ClearInput = {
        remainingSubsystemControlLinks: [
          scl(1, 10, 100, 200),
          scl(10, 2, 201, 302),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
          [20, 'subsystem'],
        ]),
        deletedSubsystemControlLink: {
          peerNodeASystemId: 10,
          peerNodeBSystemId: 20,
        },
      };

      const result = ControlIntentPropagationService.findPortsToClear(input);

      expect(result.portsToClear).toEqual([]);
    });
  });

  // ── Case A4: Truly isolated subsystem-only component ─────────────────────
  //
  // remaining = [scl1[10-20, p200-p300]] — lone S↔S link, no module in component.
  // deletedSubsystemControlLink was M1↔S10 that anchored the chain.
  // Component { 10, 20 } → clear ports 200, 300.
  describe('truly isolated subsystem-only component', () => {
    it('returns every subsystem-node port in the component', () => {
      const input: ClearInput = {
        remainingSubsystemControlLinks: [scl(10, 20, 200, 300)],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
        ]),
        deletedSubsystemControlLink: {
          peerNodeASystemId: 1,
          peerNodeBSystemId: 10,
        },
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
  // ── Case B1: Cascade fills every connected empty subsystem port ───────────
  //
  // Graph: M1(1) -scl1[p100-p200]- S(10) -scl2[p201-p300]- S(20) -scl3[p301-p400]- M2(2)
  // startPort = 200 (just filled). Empty subsystem ports: 201, 300, 301 → all filled.
  describe('single restore cascades through every connected empty port', () => {
    it('fills 201, 300, 301 with the supplied intentIds', () => {
      const input: PropagateInput = {
        startPortSystemId: 200,
        intentIds: [42, 43],
        allSubsystemControlLinks: [
          scl(1, 10, 100, 200),
          scl(10, 20, 201, 300),
          scl(20, 2, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [2, 'module'],
        ]),
        portIntentMap: new Map([
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

  // ── Case B2: Cascade stops at module boundary ────────────────────────────
  //
  // Graph: M1(1) -scl1[p100-p200]- S(10) -scl2[p201-p300]- M2(2)
  // startPort = 200. Only p201 filled; p300 (module) not crossed.
  describe('cascade stops at module boundary', () => {
    it('does not cross from a subsystem port into a module port', () => {
      const input: PropagateInput = {
        startPortSystemId: 200,
        intentIds: [7],
        allSubsystemControlLinks: [scl(1, 10, 100, 200), scl(10, 2, 201, 300)],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
        ]),
        portIntentMap: new Map([
          [100, []],
          [200, [7]],
          [201, []],
          [300, []],
        ]),
      };

      const result = ControlIntentPropagationService.cascadePropagate(input);

      expect(result.portsToFill).toHaveLength(1);
      expect(result.portsToFill[0]).toEqual({
        portSystemId: 201,
        intentIds: [7],
      });
    });
  });

  // ── Case B3: Cascade stops at already-populated subsystem port ───────────
  //
  // Graph: M1-scl1-S10-scl2-S20-scl3-M2. p300 on S20 already has intents [99].
  // startPort = 200. Fills 201, stops at 300 → does not propagate to 301.
  describe('cascade stops at an already-populated subsystem port', () => {
    it('does not propagate past a port that already carries intents', () => {
      const input: PropagateInput = {
        startPortSystemId: 200,
        intentIds: [42],
        allSubsystemControlLinks: [
          scl(1, 10, 100, 200),
          scl(10, 20, 201, 300),
          scl(20, 2, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [2, 'module'],
        ]),
        portIntentMap: new Map([
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
      expect(result.portsToFill[0]).toEqual({
        portSystemId: 201,
        intentIds: [42],
      });
    });
  });

  // ── Case B4: No reachable empty subsystem ports ───────────────────────────
  //
  // Graph: M1-scl1-S10-scl2-M2. p201 already populated.
  // startPort = 200. Only neighbour p100 is module (stopped); p201 is populated (stopped).
  describe('cascade with no reachable empty subsystem ports', () => {
    it('returns an empty portsToFill', () => {
      const input: PropagateInput = {
        startPortSystemId: 200,
        intentIds: [42],
        allSubsystemControlLinks: [scl(1, 10, 100, 200), scl(10, 2, 201, 300)],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
        ]),
        portIntentMap: new Map([
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

  // ── Case B5: Single link draw triggers chain-of-three cascade ────────────
  //
  // Graph: M1-scl1[p100-p200]-S10-scl2[p201-p300]-S20-scl3[p301-p400]-M2
  // startPort = 200 (just drawn scl1, S10.p200 populated).
  // Empty subsystem ports: 201, 300, 301 → all three filled.
  describe('single SubsystemControlLink draw fills a chain of three empty ports', () => {
    it('returns 201, 300, 301 in a single cascade pass', () => {
      const input: PropagateInput = {
        startPortSystemId: 200,
        intentIds: [11],
        allSubsystemControlLinks: [
          scl(1, 10, 100, 200),
          scl(10, 20, 201, 300),
          scl(20, 2, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [2, 'module'],
        ]),
        portIntentMap: new Map([
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
