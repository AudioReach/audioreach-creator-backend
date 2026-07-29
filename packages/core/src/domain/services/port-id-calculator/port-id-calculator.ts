/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '../../entities/common/enums/module-port-strategy.js';

export const MODULE_CONTROL_PORT_START = 0x80_00_00_00;

/**
 * Returns the N lowest data port IDs not already present in existingIds,
 * following the direction's canonical sequence for the given strategy.
 *
 * Sequences:
 *   INPUT_EVEN_OUTPUT_ODD — input:  2, 4, 6, 8, …  (start 2, increment 2)
 *                           output: 1, 3, 5, 7, …  (start 1, increment 2)
 *   SEQUENTIAL             — both:  1, 2, 3, 4, …  (start 1, increment 1)
 *
 * Gap-filling: if ports 2 and 3 were removed from a SEQUENTIAL module that
 * had {1,2,3,4,5}, requesting count=2 returns [2, 3] — not [6, 7].
 *
 * existingIds must include ALL data port IDs of the given direction on the
 * target module (static and dynamic, module-scoped — not global).
 */
export function nextDataPortIds(
  existingIds: ReadonlySet<number>,
  isInput: boolean,
  strategy: ModulePortStrategy,
  count: number,
): number[] {
  const start = dataPortStartId(isInput, strategy);
  const increment = dataPortIncrement(strategy);
  const allocated = new Set(existingIds);
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    let id = start;
    while (allocated.has(id)) id += increment;
    allocated.add(id);
    result.push(id);
  }

  return result;
}

/**
 * Returns the N lowest control port IDs not already present in existingIds.
 * Sequence: 0x80000000, 0x80000001, 0x80000002, … (always +1).
 * portStrategy has no effect on control port IDs.
 *
 * existingIds must include ALL control port IDs on the target module (static
 * and dynamic, module-scoped).
 */
export function nextControlPortIds(
  existingIds: ReadonlySet<number>,
  count: number,
): number[] {
  const allocated = new Set(existingIds);
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    let id = MODULE_CONTROL_PORT_START;
    while (allocated.has(id)) id++;
    allocated.add(id);
    result.push(id);
  }

  return result;
}

function dataPortStartId(
  isInput: boolean,
  strategy: ModulePortStrategy,
): number {
  if (strategy === MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD) {
    return isInput ? 2 : 1;
  }
  return 1;
}

function dataPortIncrement(strategy: ModulePortStrategy): number {
  return strategy === MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD ? 2 : 1;
}
