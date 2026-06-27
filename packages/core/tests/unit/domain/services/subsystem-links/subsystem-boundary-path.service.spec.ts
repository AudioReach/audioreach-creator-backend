/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  SubsystemBoundaryPathService,
  type PathInput,
  type PathOutput,
} from '../../../../../src/domain/services/subsystem-links/subsystem-boundary-path.service.js';
import {PORT_IO_TYPE} from '../../../../../src/domain/entities/common/enums/port-io-type.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  sourceNodeId: number,
  destNodeId: number,
  parentEntries: [number, number | null][],
): PathInput {
  return {
    sourceNodeId,
    destNodeId,
    nodeParentMap: new Map<number, number | null>(parentEntries),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubsystemBoundaryPathService', () => {
  // -------------------------------------------------------------------------
  // Case 1: Source at top level, dest inside one subsystem (LCA = null)
  // -------------------------------------------------------------------------
  describe('source at top level, dest inside one subsystem', () => {
    it('returns correct nodeSequence and requiredPortType', () => {
      // Layout:
      //   ModuleA (1) — parentId null  (top level)
      //   SubsystemY (10) — parentId null
      //   ModuleB (2)  — parentId 10
      const input = makeInput(1, 2, [
        [1, null],
        [10, null],
        [2, 10],
      ]);

      const result: PathOutput = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 2]);
      expect(result.requiredPortType.size).toBe(1);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.InputOutput);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Both modules in different top-level subsystems (spec worked example)
  // Layout:
  //   ModuleA (1) → SubsystemInner (10) → SubsystemOuter (20) (top level)
  //   ModuleB (2) → SubsystemY (30) (top level)
  // Expected: nodeSequence = [1, 10, 20, 30, 2]
  //   SubsystemInner (10) → OutputInput  (exit)
  //   SubsystemOuter (20) → OutputInput  (exit)
  //   SubsystemY (30)     → InputOutput  (enter)
  // -------------------------------------------------------------------------
  describe('spec worked example — source nested 2 levels, dest nested 1 level, LCA = null', () => {
    it('returns [ModuleA, SubsystemInner, SubsystemOuter, SubsystemY, ModuleB]', () => {
      const input = makeInput(1, 2, [
        [1, 10], // ModuleA inside SubsystemInner
        [10, 20], // SubsystemInner inside SubsystemOuter
        [20, null], // SubsystemOuter at top level
        [2, 30], // ModuleB inside SubsystemY
        [30, null], // SubsystemY at top level
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 20, 30, 2]);

      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(20)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(30)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Both modules share an outer subsystem (LCA is non-null node)
  //   SubsystemOuter (20) — parentId null
  //   SubsystemA (10)     — parentId 20
  //   SubsystemB (30)     — parentId 20
  //   ModuleA (1)         — parentId 10
  //   ModuleB (2)         — parentId 30
  // exitChain:  [10, 20] trimmed to [10]  (stops before LCA 20)
  // entryChain: [30, 20] trimmed to [30]  (stops before LCA 20)
  // nodeSequence: [1, 10, 30, 2]
  //   10 → OutputInput, 30 → InputOutput
  // -------------------------------------------------------------------------
  describe('both modules share outer subsystem (LCA = SubsystemOuter)', () => {
    it('does not include the LCA in nodeSequence and assigns correct port types', () => {
      const input = makeInput(1, 2, [
        [1, 10], // ModuleA inside SubsystemA
        [10, 20], // SubsystemA inside SubsystemOuter
        [2, 30], // ModuleB inside SubsystemB
        [30, 20], // SubsystemB inside SubsystemOuter
        [20, null], // SubsystemOuter at top level
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 30, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(30)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(2);
      // LCA (20) must not appear in the sequence
      expect(result.nodeSequence).not.toContain(20);
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Deep nesting on both sides with a non-null LCA
  //   Root (5)    — parentId null
  //   Mid_L (11)  — parentId 5
  //   Mid_R (21)  — parentId 5
  //   Inner_L (12)— parentId 11
  //   Inner_R (22)— parentId 21
  //   ModuleA (1) — parentId 12
  //   ModuleB (2) — parentId 22
  //
  // exitChain (from 1):  [12, 11, 5] trimmed (LCA=5) → [12, 11]
  // entryChain (from 2): [22, 21, 5] trimmed (LCA=5) → [22, 21]
  // reversed entryChain:                              → [21, 22]
  // nodeSequence: [1, 12, 11, 21, 22, 2]
  // -------------------------------------------------------------------------
  describe('deep nesting both sides with non-null LCA', () => {
    it('returns correct sequence excluding LCA node', () => {
      const input = makeInput(1, 2, [
        [1, 12],
        [12, 11],
        [11, 5],
        [5, null],
        [2, 22],
        [22, 21],
        [21, 5],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 12, 11, 21, 22, 2]);

      expect(result.requiredPortType.get(12)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(11)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(21)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.get(22)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(4);
      expect(result.nodeSequence).not.toContain(5);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: One module inside one subsystem, other module at top level
  //         (mirror of Case 1 but source is the nested one)
  //   ModuleA (1) — parentId 10
  //   SubsystemX (10) — parentId null
  //   ModuleB (2) — parentId null
  // exitChain (from 1): [10] trimmed to [10]
  // entryChain (from 2): [] (already at top)
  // nodeSequence: [1, 10, 2]
  // -------------------------------------------------------------------------
  describe('source nested one level, dest at top level', () => {
    it('returns correct sequence with exit subsystem only', () => {
      const input = makeInput(1, 2, [
        [1, 10],
        [10, null],
        [2, null],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Both in different top-level subsystems, no intermediate nesting
  //   ModuleA (1) — parentId 10
  //   SubsystemA (10) — parentId null
  //   ModuleB (2) — parentId 20
  //   SubsystemB (20) — parentId null
  // nodeSequence: [1, 10, 20, 2]
  // -------------------------------------------------------------------------
  describe('both in different top-level subsystems (simple case)', () => {
    it('returns nodeSequence with one exit and one entry subsystem', () => {
      const input = makeInput(1, 2, [
        [1, 10],
        [10, null],
        [2, 20],
        [20, null],
      ]);

      const result = SubsystemBoundaryPathService.compute(input);

      expect(result.nodeSequence).toEqual([1, 10, 20, 2]);
      expect(result.requiredPortType.get(10)).toBe(PORT_IO_TYPE.OutputInput);
      expect(result.requiredPortType.get(20)).toBe(PORT_IO_TYPE.InputOutput);
      expect(result.requiredPortType.size).toBe(2);
    });
  });
});
