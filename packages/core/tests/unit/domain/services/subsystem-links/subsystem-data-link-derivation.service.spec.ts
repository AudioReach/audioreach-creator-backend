/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {SubsystemDataLinkDerivationService} from '../../../../../src/domain/services/subsystem-data-links/subsystem-data-link-derivation.service.js';
import {PORT_IO_TYPE} from '../../../../../src/domain/entities/common/enums/port-io-type.js';

function makeMap(
  entries: [number, number | null][],
): Map<number, number | null> {
  return new Map(entries);
}

describe('SubsystemDataLinkDerivationService', () => {
  it('Case 1: source at top level, dest inside one subsystem', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, null],
        [10, null],
        [2, 10],
      ]),
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sourceNodeId: 1,
      destNodeId: 10,
      sourceBoundaryPortType: null,
      destBoundaryPortType: PORT_IO_TYPE.InputOutput,
      position: 0,
    });
    expect(result[1]).toMatchObject({
      sourceNodeId: 10,
      destNodeId: 2,
      sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
      destBoundaryPortType: null,
      position: 1,
    });
  });

  it('Case 2: both in different top-level subsystems (simple)', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, 10],
        [10, null],
        [2, 20],
        [20, null],
      ]),
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      sourceNodeId: 1,
      destNodeId: 10,
      sourceBoundaryPortType: null,
      destBoundaryPortType: PORT_IO_TYPE.OutputInput,
      position: 0,
    });
    expect(result[1]).toMatchObject({
      sourceNodeId: 10,
      destNodeId: 20,
      sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
      destBoundaryPortType: PORT_IO_TYPE.InputOutput,
      position: 1,
    });
    expect(result[2]).toMatchObject({
      sourceNodeId: 20,
      destNodeId: 2,
      sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
      destBoundaryPortType: null,
      position: 2,
    });
  });

  it('Case 3: both share outer subsystem (LCA = SubsystemOuter)', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, 10],
        [10, 20],
        [2, 30],
        [30, 20],
        [20, null],
      ]),
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      sourceNodeId: 1,
      destNodeId: 10,
      sourceBoundaryPortType: null,
      destBoundaryPortType: PORT_IO_TYPE.OutputInput,
      position: 0,
    });
    expect(result[1]).toMatchObject({
      sourceNodeId: 10,
      destNodeId: 30,
      sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
      destBoundaryPortType: PORT_IO_TYPE.InputOutput,
      position: 1,
    });
    expect(result[2]).toMatchObject({
      sourceNodeId: 30,
      destNodeId: 2,
      sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
      destBoundaryPortType: null,
      position: 2,
    });
  });

  it('Case 4: deep nesting both sides with non-null LCA', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, 12],
        [12, 11],
        [11, 5],
        [5, null],
        [2, 22],
        [22, 21],
        [21, 5],
      ]),
    });
    expect(result).toHaveLength(5);
    expect(result[0].sourceNodeId).toBe(1);
    expect(result[0].destNodeId).toBe(12);
    expect(result[4].sourceNodeId).toBe(22);
    expect(result[4].destNodeId).toBe(2);
    expect(result[0].sourceBoundaryPortType).toBeNull();
    expect(result[4].destBoundaryPortType).toBeNull();
  });

  it('Case 5: source nested one level, dest at top level', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, 10],
        [10, null],
        [2, null],
      ]),
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sourceNodeId: 1,
      destNodeId: 10,
      sourceBoundaryPortType: null,
      destBoundaryPortType: PORT_IO_TYPE.OutputInput,
    });
    expect(result[1]).toMatchObject({
      sourceNodeId: 10,
      destNodeId: 2,
      sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
      destBoundaryPortType: null,
    });
  });

  it('returns [] when source and dest share the same parent context', () => {
    const result = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: 1,
      destNodeId: 2,
      nodeParentMap: makeMap([
        [1, 10],
        [2, 10],
        [10, null],
      ]),
    });
    expect(result).toHaveLength(0);
  });
});
