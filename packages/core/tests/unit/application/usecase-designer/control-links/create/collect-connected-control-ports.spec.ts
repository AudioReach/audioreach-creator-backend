/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {collectConnectedControlPorts} from '../../../../../../src/application/usecase-designer/control-links/create/collect-connected-control-ports.js';

describe('collectConnectedControlPorts', () => {
  it('traverses mixed canonical and subsystem-link edges', () => {
    const result = collectConnectedControlPorts(
      [
        {nodeAPortSystemId: 1, nodeBPortSystemId: 2},
        {nodeAPortSystemId: 2, nodeBPortSystemId: 3},
        {nodeAPortSystemId: 3, nodeBPortSystemId: 4},
      ],
      [1],
    );

    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('continues through a populated subsystem port', () => {
    const result = collectConnectedControlPorts(
      [
        {nodeAPortSystemId: 10, nodeBPortSystemId: 20},
        {nodeAPortSystemId: 20, nodeBPortSystemId: 30},
        {nodeAPortSystemId: 30, nodeBPortSystemId: 40},
      ],
      [10, 20],
    );

    expect([...result].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });

  it('does not connect unrelated ports on the same subsystem node', () => {
    const result = collectConnectedControlPorts(
      [{nodeAPortSystemId: 100, nodeBPortSystemId: 200}],
      [100],
    );

    expect([...result]).toEqual([100, 200]);
    expect(result.has(300)).toBe(false);
  });

  it('handles cycles without revisiting ports', () => {
    const result = collectConnectedControlPorts(
      [
        {nodeAPortSystemId: 1, nodeBPortSystemId: 2},
        {nodeAPortSystemId: 2, nodeBPortSystemId: 3},
        {nodeAPortSystemId: 3, nodeBPortSystemId: 1},
      ],
      [1],
    );

    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
