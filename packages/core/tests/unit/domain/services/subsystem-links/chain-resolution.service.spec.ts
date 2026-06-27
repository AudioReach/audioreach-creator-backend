/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  ChainResolutionService,
  type ResolutionInput,
  type ResolutionResult,
} from '../../../../../src/domain/services/subsystem-links/chain-resolution.service.js';
import {NodeType} from '../../../../../src/domain/entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubsystemLinkShape = ResolutionInput['unresolvedSubsystemLinks'][number];

function ssLink(
  systemId: number,
  srcNode: number,
  dstNode: number,
  srcPort: number,
  dstPort: number,
): SubsystemLinkShape {
  return {
    systemId,
    sourceNodeSystemId: srcNode,
    destinationNodeSystemId: dstNode,
    sourcePortSystemId: srcPort,
    destinationPortSystemId: dstPort,
  };
}

function nodeTypeMap(
  entries: [number, 'module' | 'subsystem'][],
): Map<number, NodeType> {
  return new Map(entries.map(([id, t]) => [id, t as NodeType]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainResolutionService', () => {
  // -------------------------------------------------------------------------
  // Case 1: Empty input (fast path)
  // -------------------------------------------------------------------------
  describe('empty input', () => {
    it('returns empty completeChains and incompleteChains', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [],
        nodeTypeMap: new Map(),
      };

      const result: ResolutionResult = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Single complete chain — module → subsystem → module
  // Links:
  //   L1: ModuleA(1) → SubsystemX(10),  port 100 → port 200
  //   L2: SubsystemX(10) → ModuleB(2),  port 201 → port 300
  // Expected complete chain: ssLinkSystemIds=[1,2], srcModule=1, dstModule=2,
  //   sourcePortId=100, destPortId=300
  // -------------------------------------------------------------------------
  describe('single complete chain (module → subsystem → module)', () => {
    it('resolves to one complete chain with correct endpoints and port IDs', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          ssLink(1, 1, 10, 100, 200), // ModuleA → SubsystemX
          ssLink(2, 10, 2, 201, 300), // SubsystemX → ModuleB
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(1);
      expect(result.incompleteChains).toHaveLength(0);

      const chain = result.completeChains[0];
      expect(chain.ssLinkSystemIds).toEqual([1, 2]);
      expect(chain.sourceModuleSystemId).toBe(1);
      expect(chain.destModuleSystemId).toBe(2);
      expect(chain.sourcePortId).toBe(100);
      expect(chain.destPortId).toBe(300);
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Multiple independent complete chains
  // Chain A: ModuleA(1) → SubsysX(10) → ModuleB(2)
  // Chain B: ModuleC(3) → SubsysY(20) → ModuleD(4)
  // -------------------------------------------------------------------------
  describe('multiple independent complete chains', () => {
    it('returns all chains without cross-contamination', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          // Chain A
          ssLink(1, 1, 10, 101, 201),
          ssLink(2, 10, 2, 202, 301),
          // Chain B
          ssLink(3, 3, 20, 103, 203),
          ssLink(4, 20, 4, 204, 304),
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

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(2);
      expect(result.incompleteChains).toHaveLength(0);

      const chainA = result.completeChains.find(
        c => c.sourceModuleSystemId === 1,
      );
      const chainB = result.completeChains.find(
        c => c.sourceModuleSystemId === 3,
      );

      expect(chainA).toBeDefined();
      expect(chainA!.ssLinkSystemIds).toEqual([1, 2]);
      expect(chainA!.destModuleSystemId).toBe(2);
      expect(chainA!.sourcePortId).toBe(101);
      expect(chainA!.destPortId).toBe(301);

      expect(chainB).toBeDefined();
      expect(chainB!.ssLinkSystemIds).toEqual([3, 4]);
      expect(chainB!.destModuleSystemId).toBe(4);
      expect(chainB!.sourcePortId).toBe(103);
      expect(chainB!.destPortId).toBe(304);
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Incomplete chain — dead end at a subsystem node
  // ModuleA(1) → SubsysX(10)  (no outgoing link from SubsysX)
  // -------------------------------------------------------------------------
  describe('incomplete chain — dead end at subsystem', () => {
    it('reports an incomplete chain with the start module and last reachable node', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          ssLink(1, 1, 10, 100, 200), // ModuleA → SubsystemX (dead end)
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains).toHaveLength(1);

      const incomplete = result.incompleteChains[0];
      expect(incomplete.ssLinkSystemIds).toEqual([1]);
      expect(incomplete.startModuleSystemId).toBe(1);
      expect(incomplete.lastReachableNodeId).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Cycle detection
  // ModuleA(1) → SubsysX(10) → SubsysY(20) → SubsysX(10)  — cycle at 10
  // -------------------------------------------------------------------------
  describe('cycle detection', () => {
    it('reports an incomplete chain when a cycle is detected', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          ssLink(1, 1, 10, 100, 200), // ModuleA → SubsysX
          ssLink(2, 10, 20, 201, 300), // SubsysX → SubsysY
          ssLink(3, 20, 10, 301, 202), // SubsysY → SubsysX (cycle!)
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(0);
      expect(result.incompleteChains.length).toBeGreaterThan(0);

      const inc = result.incompleteChains[0];
      expect(inc.startModuleSystemId).toBe(1);

      const allReported = new Set(
        result.incompleteChains.flatMap(c => c.ssLinkSystemIds),
      );
      expect(allReported.has(1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Fan-out — one module with two outgoing links (two chains)
  // ModuleA(1) → SubsysX(10) → ModuleB(2)
  // ModuleA(1) → SubsysY(20) → ModuleC(3)
  // -------------------------------------------------------------------------
  describe('fan-out — one module with two outgoing SLS', () => {
    it('walks both branches as independent chains', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          // Branch 1
          ssLink(1, 1, 10, 101, 201),
          ssLink(2, 10, 2, 202, 301),
          // Branch 2
          ssLink(3, 1, 20, 102, 401), // same source module, different port
          ssLink(4, 20, 3, 402, 501),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [2, 'module'],
          [20, 'subsystem'],
          [3, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(2);
      expect(result.incompleteChains).toHaveLength(0);

      const chainToB = result.completeChains.find(
        c => c.destModuleSystemId === 2,
      );
      const chainToC = result.completeChains.find(
        c => c.destModuleSystemId === 3,
      );

      expect(chainToB).toBeDefined();
      expect(chainToB!.sourceModuleSystemId).toBe(1);
      expect(chainToB!.ssLinkSystemIds).toEqual([1, 2]);
      expect(chainToB!.sourcePortId).toBe(101);
      expect(chainToB!.destPortId).toBe(301);

      expect(chainToC).toBeDefined();
      expect(chainToC!.sourceModuleSystemId).toBe(1);
      expect(chainToC!.ssLinkSystemIds).toEqual([3, 4]);
      expect(chainToC!.sourcePortId).toBe(102);
      expect(chainToC!.destPortId).toBe(501);
    });
  });

  // -------------------------------------------------------------------------
  // Case 7: Chain of three links (module → sub → sub → module)
  // ModuleA(1) → SubsysX(10) → SubsysY(20) → ModuleB(2)
  // -------------------------------------------------------------------------
  describe('three-link complete chain', () => {
    it('resolves and carries first source port and last dest port', () => {
      const input: ResolutionInput = {
        unresolvedSubsystemLinks: [
          ssLink(1, 1, 10, 100, 200),
          ssLink(2, 10, 20, 201, 300),
          ssLink(3, 20, 2, 301, 400),
        ],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
          [20, 'subsystem'],
          [2, 'module'],
        ]),
      };

      const result = ChainResolutionService.resolve(input);

      expect(result.completeChains).toHaveLength(1);
      const chain = result.completeChains[0];
      expect(chain.ssLinkSystemIds).toEqual([1, 2, 3]);
      expect(chain.sourceModuleSystemId).toBe(1);
      expect(chain.destModuleSystemId).toBe(2);
      expect(chain.sourcePortId).toBe(100);
      expect(chain.destPortId).toBe(400);
    });
  });
});
