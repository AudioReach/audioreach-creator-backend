/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  ControlChainResolutionService,
  type SubsystemControlLinkResolutionInput,
  type SubsystemControlLinkResolutionResult,
} from '../../../../../src/domain/services/subsystem-control-links/control-chain-resolution.service.js';
import {NodeType} from '../../../../../src/domain/entities/usecase-data/node/node.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubsystemControlLinkShape =
  SubsystemControlLinkResolutionInput['unresolvedSubsystemlinks'][number];

function scl(
  systemId: number,
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
  nodeAPortSystemId: number,
  nodeBPortSystemId: number,
): SubsystemControlLinkShape {
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

function sortedIds(chain: {ssLinksSystemIds: number[]}): number[] {
  return [...chain.ssLinksSystemIds].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ControlChainResolutionService (spec §11.9)', () => {
  // ── Case 1: Empty input ──────────────────────────────────────────────────
  describe('empty input', () => {
    it('returns empty completeChains and incompleteChains', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [],
        nodeTypeMap: new Map(),
      };
      const result: SubsystemControlLinkResolutionResult =
        ControlChainResolutionService.resolve(input);
      expect(result.completeChains).toEqual([]);
      expect(result.incompleteChains).toEqual([]);
    });
  });

  // ── Case 2: Single complete chain — Module ↔ Subsystem ↔ Module ─────────
  describe('single complete chain (module ↔ subsystem ↔ module)', () => {
    it('resolves to one complete chain with canonical endpoint ordering', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 100, 200),
          scl(2, 10, 2, 201, 300),
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
      expect(sortedIds(chain)).toEqual([1, 2]);
      expect(chain.peerAPortSystemId).toBe(100);
      expect(chain.peerBPortSystemId).toBe(300);
      expect(chain.peerAModuleSystemId).toBe(1);
      expect(chain.peerBModuleSystemId).toBe(2);
    });
  });

  // ── Case 3: Multiple independent complete chains ─────────────────────────
  describe('multiple independent complete chains', () => {
    it('returns both chains without cross-contamination', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 101, 201),
          scl(2, 10, 2, 202, 301),
          scl(3, 3, 20, 103, 203),
          scl(4, 20, 4, 204, 304),
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
        c => c.peerAModuleSystemId === 1 || c.peerBModuleSystemId === 1,
      )!;
      const chainB = result.completeChains.find(
        c => c.peerAModuleSystemId === 3 || c.peerBModuleSystemId === 3,
      )!;

      expect(sortedIds(chainA)).toEqual([1, 2]);
      expect(chainA.peerAPortSystemId).toBe(101);
      expect(chainA.peerBPortSystemId).toBe(301);
      expect(chainA.peerAModuleSystemId).toBe(1);
      expect(chainA.peerBModuleSystemId).toBe(2);

      expect(sortedIds(chainB)).toEqual([3, 4]);
      expect(chainB.peerAPortSystemId).toBe(103);
      expect(chainB.peerBPortSystemId).toBe(304);
      expect(chainB.peerAModuleSystemId).toBe(3);
      expect(chainB.peerBModuleSystemId).toBe(4);
    });
  });

  // ── Case 4: Incomplete chain — dead end at subsystem ─────────────────────
  describe('incomplete chain — dead end at subsystem', () => {
    it('reports an incomplete chain whose reachable nodes are the module and the subsystem', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [scl(1, 1, 10, 100, 200)],
        nodeTypeMap: nodeTypeMap([
          [1, 'module'],
          [10, 'subsystem'],
        ]),
      };

      const result = ControlChainResolutionService.resolve(input);

      expect(result.completeChains).toEqual([]);
      expect(result.incompleteChains).toHaveLength(1);

      const incomplete = result.incompleteChains[0];
      expect(incomplete.ssLinksSystemIds).toEqual([1]);
      expect(new Set(incomplete.reachableNodeIds)).toEqual(new Set([1, 10]));
    });
  });

  // ── Case 5: Cycle detection ───────────────────────────────────────────────
  describe('cycle detection', () => {
    it('reports incomplete and produces no complete chain when a cycle is reachable', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 100, 200),
          scl(2, 10, 20, 201, 300),
          scl(3, 20, 10, 301, 202),
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

      const allIds = new Set(
        result.incompleteChains.flatMap(c => c.ssLinksSystemIds),
      );
      expect(allIds.has(1)).toBe(true);
      expect(allIds.has(2)).toBe(true);
      expect(allIds.has(3)).toBe(true);

      const allReachable = new Set(
        result.incompleteChains.flatMap(c => c.reachableNodeIds),
      );
      expect(allReachable.has(1)).toBe(true);
      expect(allReachable.has(10)).toBe(true);
      expect(allReachable.has(20)).toBe(true);
    });
  });

  // ── Case 6: Fan-out — one module with two outgoing links ─────────────────
  describe('fan-out — one module with two outgoing SubsystemControlLinks', () => {
    it('walks both branches as independent complete chains', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 101, 201),
          scl(2, 10, 2, 202, 301),
          scl(3, 1, 20, 102, 401),
          scl(4, 20, 3, 402, 501),
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
        c => c.peerAModuleSystemId === 2 || c.peerBModuleSystemId === 2,
      )!;
      const chainToM3 = result.completeChains.find(
        c => c.peerAModuleSystemId === 3 || c.peerBModuleSystemId === 3,
      )!;

      expect(sortedIds(chainToM2)).toEqual([1, 2]);
      expect(chainToM2.peerAPortSystemId).toBe(101);
      expect(chainToM2.peerBPortSystemId).toBe(301);
      expect(chainToM2.peerAModuleSystemId).toBe(1);
      expect(chainToM2.peerBModuleSystemId).toBe(2);

      expect(sortedIds(chainToM3)).toEqual([3, 4]);
      expect(chainToM3.peerAPortSystemId).toBe(102);
      expect(chainToM3.peerBPortSystemId).toBe(501);
      expect(chainToM3.peerAModuleSystemId).toBe(1);
      expect(chainToM3.peerBModuleSystemId).toBe(3);
    });
  });

  // ── Case 7: Reverse-direction equivalence ────────────────────────────────
  describe('reverse-direction equivalence', () => {
    it('emits exactly one complete chain regardless of traversal direction (port 100 < 300)', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 100, 200),
          scl(2, 10, 2, 201, 300),
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
      expect(chain.peerAModuleSystemId).toBe(1);
      expect(chain.peerBModuleSystemId).toBe(2);
    });

    it('also emits exactly one chain when the higher-port-id module is encountered first by DFS', () => {
      const input: SubsystemControlLinkResolutionInput = {
        unresolvedSubsystemlinks: [
          scl(1, 1, 10, 500, 200),
          scl(2, 10, 2, 201, 50),
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
      expect(chain.peerAModuleSystemId).toBe(2);
      expect(chain.peerBModuleSystemId).toBe(1);
    });
  });
});
