/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {GetLogsByProjectQuery} from '../../../../src/application/logging/get-logs/get-logs-by-project.query.js';

describe('GetLogsByProjectQuery', () => {
  it('stores projectId and clientId correctly', () => {
    const query = new GetLogsByProjectQuery('proj-42', 'client-abc');

    expect(query.projectId).toBe('proj-42');
    expect(query.clientId).toBe('client-abc');
  });

  it('generates a unique id for each instance', () => {
    const q1 = new GetLogsByProjectQuery('proj-42', 'client-abc');
    const q2 = new GetLogsByProjectQuery('proj-42', 'client-abc');

    expect(q1.id).toBeDefined();
    expect(q2.id).toBeDefined();
    expect(q1.id).not.toBe(q2.id);
  });

  it('sets a timeStamp on construction', () => {
    const before = new Date();
    const query = new GetLogsByProjectQuery('proj-42', 'client-abc');
    const after = new Date();

    expect(query.timeStamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(query.timeStamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
