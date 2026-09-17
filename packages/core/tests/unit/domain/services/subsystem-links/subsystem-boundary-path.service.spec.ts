/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {PORT_IO_TYPE} from '../../../../../src/domain/entities/common/enums/port-io-type.js';
import {
  SubsystemBoundaryPathService,
  type SegmentDescriptor,
} from '../../../../../src/domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

function derive(
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
  entries: [number, number | null][],
): SegmentDescriptor[] {
  return SubsystemBoundaryPathService.compute({
    sourceNodeSystemId,
    destinationNodeSystemId,
    nodeParentMap: new Map(entries),
  });
}

describe('SubsystemBoundaryPathService', () => {
  it('derives entry segments from a top-level source to a nested destination', () => {
    expect(
      derive(1, 2, [
        [1, null],
        [10, null],
        [2, 10],
      ]),
    ).toEqual([
      {
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 10,
        sourceBoundaryPortType: null,
        destBoundaryPortType: PORT_IO_TYPE.InputOutput,
        position: 0,
      },
      {
        sourceNodeSystemId: 10,
        destinationNodeSystemId: 2,
        sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
        destBoundaryPortType: null,
        position: 1,
      },
    ]);
  });

  it('derives exit and entry segments across separate top-level subsystems', () => {
    expect(
      derive(1, 2, [
        [1, 10],
        [10, null],
        [2, 20],
        [20, null],
      ]),
    ).toEqual([
      {
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 10,
        sourceBoundaryPortType: null,
        destBoundaryPortType: PORT_IO_TYPE.OutputInput,
        position: 0,
      },
      {
        sourceNodeSystemId: 10,
        destinationNodeSystemId: 20,
        sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
        destBoundaryPortType: PORT_IO_TYPE.InputOutput,
        position: 1,
      },
      {
        sourceNodeSystemId: 20,
        destinationNodeSystemId: 2,
        sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
        destBoundaryPortType: null,
        position: 2,
      },
    ]);
  });

  it('excludes a shared outer subsystem from derived segments', () => {
    expect(
      derive(1, 2, [
        [1, 10],
        [10, 20],
        [2, 30],
        [30, 20],
        [20, null],
      ]),
    ).toEqual([
      {
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 10,
        sourceBoundaryPortType: null,
        destBoundaryPortType: PORT_IO_TYPE.OutputInput,
        position: 0,
      },
      {
        sourceNodeSystemId: 10,
        destinationNodeSystemId: 30,
        sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
        destBoundaryPortType: PORT_IO_TYPE.InputOutput,
        position: 1,
      },
      {
        sourceNodeSystemId: 30,
        destinationNodeSystemId: 2,
        sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
        destBoundaryPortType: null,
        position: 2,
      },
    ]);
  });

  it('preserves all boundaries for deep nesting with a common ancestor', () => {
    const segments = derive(1, 2, [
      [1, 12],
      [12, 11],
      [11, 5],
      [5, null],
      [2, 22],
      [22, 21],
      [21, 5],
    ]);

    expect(
      segments.map(segment => [
        segment.sourceNodeSystemId,
        segment.destinationNodeSystemId,
        segment.position,
      ]),
    ).toEqual([
      [1, 12, 0],
      [12, 11, 1],
      [11, 21, 2],
      [21, 22, 3],
      [22, 2, 4],
    ]);
    expect(
      segments.map(segment => [
        segment.sourceBoundaryPortType,
        segment.destBoundaryPortType,
      ]),
    ).toEqual([
      [null, PORT_IO_TYPE.OutputInput],
      [PORT_IO_TYPE.OutputInput, PORT_IO_TYPE.OutputInput],
      [PORT_IO_TYPE.OutputInput, PORT_IO_TYPE.InputOutput],
      [PORT_IO_TYPE.InputOutput, PORT_IO_TYPE.InputOutput],
      [PORT_IO_TYPE.InputOutput, null],
    ]);
  });

  it('derives exit segments from a nested source to a top-level destination', () => {
    expect(
      derive(1, 2, [
        [1, 10],
        [10, null],
        [2, null],
      ]),
    ).toEqual([
      {
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 10,
        sourceBoundaryPortType: null,
        destBoundaryPortType: PORT_IO_TYPE.OutputInput,
        position: 0,
      },
      {
        sourceNodeSystemId: 10,
        destinationNodeSystemId: 2,
        sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
        destBoundaryPortType: null,
        position: 1,
      },
    ]);
  });

  it('returns no segments for endpoints in the same subsystem context', () => {
    expect(
      derive(1, 2, [
        [1, 10],
        [2, 10],
        [10, null],
      ]),
    ).toEqual([]);
  });
});
