/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  nextDataPortIds,
  nextControlPortIds,
  MODULE_CONTROL_PORT_START,
} from '../../../../../src/domain/services/port-id-calculator/port-id-calculator.js';
import {MODULE_PORT_STRATEGIES} from '../../../../../src/domain/entities/common/enums/module-port-strategy.js';

// ── nextDataPortIds ──────────────────────────────────────────────────────────

describe('nextDataPortIds — SEQUENTIAL strategy', () => {
  it('returns [1] for an empty module requesting 1 input port', () => {
    expect(
      nextDataPortIds(new Set(), true, MODULE_PORT_STRATEGIES.SEQUENTIAL, 1),
    ).toEqual([1]);
  });

  it('returns [1, 2, 3] for an empty module requesting 3 input ports', () => {
    expect(
      nextDataPortIds(new Set(), true, MODULE_PORT_STRATEGIES.SEQUENTIAL, 3),
    ).toEqual([1, 2, 3]);
  });

  it('fills gaps when IDs 2 and 3 were removed from {1,2,3,4,5}', () => {
    // Existing: {1, 4, 5} — ports 2 and 3 were removed.
    // Adding 2 ports should return [2, 3], not [6, 7].
    expect(
      nextDataPortIds(
        new Set([1, 4, 5]),
        true,
        MODULE_PORT_STRATEGIES.SEQUENTIAL,
        2,
      ),
    ).toEqual([2, 3]);
  });

  it('uses the same sequence for output ports under SEQUENTIAL', () => {
    expect(
      nextDataPortIds(
        new Set([1, 2]),
        false,
        MODULE_PORT_STRATEGIES.SEQUENTIAL,
        2,
      ),
    ).toEqual([3, 4]);
  });

  it('returns [] when count is 0', () => {
    expect(
      nextDataPortIds(
        new Set([1, 2]),
        true,
        MODULE_PORT_STRATEGIES.SEQUENTIAL,
        0,
      ),
    ).toEqual([]);
  });
});

describe('nextDataPortIds — INPUT_EVEN_OUTPUT_ODD strategy', () => {
  it('returns [2, 4, 6] for empty module input, 3 ports', () => {
    expect(
      nextDataPortIds(
        new Set(),
        true,
        MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
        3,
      ),
    ).toEqual([2, 4, 6]);
  });

  it('fills gap when input port 4 was removed from {2,4,6}', () => {
    // Existing inputs: {2, 6} — port 4 removed. Next 2 adds → [4, 8].
    expect(
      nextDataPortIds(
        new Set([2, 6]),
        true,
        MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
        2,
      ),
    ).toEqual([4, 8]);
  });

  it('returns [1, 3, 5] for empty module output, 3 ports', () => {
    expect(
      nextDataPortIds(
        new Set(),
        false,
        MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
        3,
      ),
    ).toEqual([1, 3, 5]);
  });

  it('never assigns an even ID to an output port', () => {
    // Existing outputs: {1, 3} — next should be 5 (odd), not 4 (even).
    expect(
      nextDataPortIds(
        new Set([1, 3]),
        false,
        MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
        1,
      ),
    ).toEqual([5]);
  });

  it('static port IDs in occupied set do not prevent correct gap-fill', () => {
    // A static input port has dataPortId=2 (from definition).
    // Next dynamic input should be 4, not 2.
    expect(
      nextDataPortIds(
        new Set([2]),
        true,
        MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD,
        1,
      ),
    ).toEqual([4]);
  });
});

// ── nextControlPortIds ────────────────────────────────────────────────────────

describe('nextControlPortIds', () => {
  it('returns [0x80000000] for an empty module requesting 1 port', () => {
    expect(nextControlPortIds(new Set(), 1)).toEqual([
      MODULE_CONTROL_PORT_START,
    ]);
  });

  it('returns next sequential ID when 0x80000000 and 0x80000001 are occupied', () => {
    expect(nextControlPortIds(new Set([0x80000000, 0x80000001]), 1)).toEqual([
      0x80000002,
    ]);
  });

  it('fills gap when 0x80000001 was removed from {0x80000000, 0x80000001, 0x80000002}', () => {
    expect(nextControlPortIds(new Set([0x80000000, 0x80000002]), 1)).toEqual([
      0x80000001,
    ]);
  });

  it('always increments by 1 (strategy is not a parameter)', () => {
    expect(nextControlPortIds(new Set([0x80000000, 0x80000001]), 1)).toEqual([
      0x80000002,
    ]);
  });

  it('returns [] when count is 0', () => {
    expect(nextControlPortIds(new Set([0x80000000]), 0)).toEqual([]);
  });

  it('allocates N ports filling ascending gaps', () => {
    // Existing: {0x80000000, 0x80000002} — requesting 2 fills [0x80000001, 0x80000003].
    expect(nextControlPortIds(new Set([0x80000000, 0x80000002]), 2)).toEqual([
      0x80000001, 0x80000003,
    ]);
  });
});
