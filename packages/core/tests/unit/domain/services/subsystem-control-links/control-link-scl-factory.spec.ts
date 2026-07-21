/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {ControlLinkSclFactory} from '../../../../../src/domain/services/subsystem-control-links/control-link-scl-factory.js';

describe('ControlLinkSclFactory.compute', () => {
  it('returns nodeSequence of length 2 when both nodes have the same parent (no SCL needed)', () => {
    const nodeParentMap = new Map<number, number | null>([
      [100, 10], // moduleA → subsystem 10
      [200, 10], // moduleB → same subsystem 10
      [10, null],
    ]);
    const result = ControlLinkSclFactory.compute({
      nodeASystemId: 100,
      nodeBSystemId: 200,
      nodeParentMap,
    });
    expect(result.nodeSequence).toEqual([100, 200]);
  });

  it('returns nodeSequence of length 3 with one intermediate subsystem', () => {
    const nodeParentMap = new Map<number, number | null>([
      [100, null], // moduleA at top level
      [200, 10], // moduleB inside subsystem 10
      [10, null], // subsystem 10 at top level
    ]);
    const result = ControlLinkSclFactory.compute({
      nodeASystemId: 100,
      nodeBSystemId: 200,
      nodeParentMap,
    });
    expect(result.nodeSequence).toEqual([100, 10, 200]);
  });

  it('returns nodeSequence of length 4 with two intermediate subsystems', () => {
    const nodeParentMap = new Map<number, number | null>([
      [100, 10], // moduleA inside ss10
      [200, 20], // moduleB inside ss20
      [10, null],
      [20, null],
    ]);
    const result = ControlLinkSclFactory.compute({
      nodeASystemId: 100,
      nodeBSystemId: 200,
      nodeParentMap,
    });
    // exitChain from 100: [10], entryChain from 200: [20], no LCA
    expect(result.nodeSequence).toEqual([100, 10, 20, 200]);
  });

  it('returns nodeSequence of length 2 when both nodes are at top level', () => {
    const nodeParentMap = new Map<number, number | null>([
      [100, null],
      [200, null],
    ]);
    const result = ControlLinkSclFactory.compute({
      nodeASystemId: 100,
      nodeBSystemId: 200,
      nodeParentMap,
    });
    expect(result.nodeSequence).toEqual([100, 200]);
  });
});
