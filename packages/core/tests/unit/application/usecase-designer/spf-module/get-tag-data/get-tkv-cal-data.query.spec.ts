/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {GetTkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.js';
import {InvalidOperationException} from '../../../../../../src/shared/exceptions/invalid-operation.exception.js';

describe('GetTkvCalibrationDataQuery', () => {
  it('parses all decimal IDs correctly', () => {
    const q = new GetTkvCalibrationDataQuery('1', '2', '3', '4', 'client');
    expect(q.projectId).toBe(1);
    expect(q.spfModuleSystemId).toBe(2);
    expect(q.tagSystemId).toBe(3);
    expect(q.tkvSystemId).toBe(4);
    expect(q.paramSystemIds).toHaveLength(0);
  });

  it('parses hex IDs (0x prefix)', () => {
    const q = new GetTkvCalibrationDataQuery('0x1', '0x2', '0x3', '0x4', 'c');
    expect(q.projectId).toBe(1);
    expect(q.tagSystemId).toBe(3);
    expect(q.tkvSystemId).toBe(4);
  });

  it('parses comma-separated paramSystemIds', () => {
    const q = new GetTkvCalibrationDataQuery(
      '1',
      '2',
      '3',
      '4',
      'c',
      '10,20,0x1e',
    );
    expect(q.paramSystemIds).toEqual([10, 20, 30]);
  });

  it('returns empty paramSystemIds when not provided', () => {
    const q = new GetTkvCalibrationDataQuery('1', '2', '3', '4', 'c');
    expect(q.paramSystemIds).toEqual([]);
  });

  it('throws InvalidOperationException for non-numeric tagSystemId', () => {
    expect(
      () => new GetTkvCalibrationDataQuery('1', '2', 'abc', '4', 'c'),
    ).toThrow(InvalidOperationException);
  });

  it('throws InvalidOperationException for non-numeric tkvSystemId', () => {
    expect(
      () => new GetTkvCalibrationDataQuery('1', '2', '3', 'xyz', 'c'),
    ).toThrow(InvalidOperationException);
  });
});
