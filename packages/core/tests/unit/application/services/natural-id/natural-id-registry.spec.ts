/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {NaturalIdType} from '../../../../../src/domain/services/natural-id-generator/natural-id-type.js';
import {NaturalIdRegistry} from '../../../../../src/application/services/natural-id-generator/natural-id.registry.js';

describe('NaturalIdRegistry', () => {
  let registry: NaturalIdRegistry;

  beforeEach(() => {
    registry = new NaturalIdRegistry();
  });

  it('reg-01: registerBatch skips registered IDs on getNextId', () => {
    registry.registerBatch(1, [
      {type: NaturalIdType.SUBGRAPH, id: 0xb0000001},
      {type: NaturalIdType.SUBGRAPH, id: 0xb0000002},
      {type: NaturalIdType.SUBGRAPH, id: 0xb0000003},
    ]);
    expect(registry.getNextId(1, NaturalIdType.SUBGRAPH)).toBe(0xb0000004);
  });

  it('reg-02: two files maintain independent generators', () => {
    registry.registerBatch(1, [{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    registry.registerBatch(2, [{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    expect(registry.getNextId(1, NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
    expect(registry.getNextId(2, NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
  });

  it('load-01: ensureLoaded invokes loader exactly once for concurrent calls', async () => {
    const loader = jest
      .fn()
      .mockResolvedValue([{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    await Promise.all([
      registry.ensureLoaded(1, loader),
      registry.ensureLoaded(1, loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(registry.getNextId(1, NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
  });

  it('load-02: ensureLoaded is a no-op when file already loaded via registerBatch', async () => {
    registry.registerBatch(1, [{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    const loader = jest
      .fn()
      .mockRejectedValue(new Error('should not be called'));
    await expect(registry.ensureLoaded(1, loader)).resolves.toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
    expect(registry.getNextId(1, NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
  });

  it('vmid-01: setVmid returns correct remappings; subsequent getNextId uses new range', () => {
    registry.registerBatch(1, [{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    const result = registry.setVmid(1, 1);
    expect(result.success).toBe(true);
    expect(result.remappings).toEqual([
      {type: NaturalIdType.SUBGRAPH, oldId: 0xb0000001, newId: 0xb1000001},
    ]);
    expect(registry.getNextId(1, NaturalIdType.SUBGRAPH)).toBe(0xb1000002);
  });

  it('vmid-02: resetVmid remaps IDs back to VMID=0 and restores range', () => {
    registry.registerBatch(1, [{type: NaturalIdType.SUBGRAPH, id: 0xb0000001}]);
    registry.setVmid(1, 1);
    const remappings = registry.resetVmid(1);
    expect(remappings).toEqual([
      {type: NaturalIdType.SUBGRAPH, oldId: 0xb1000001, newId: 0xb0000001},
    ]);
    expect(registry.getRange(1, NaturalIdType.SUBGRAPH)).toEqual({
      min: 0xb0000001,
      max: 0xb0ffffff,
    });
  });

  it('release-01: release on unknown file creates fresh generator and returns false', () => {
    expect(() => {
      const result = registry.release(99, NaturalIdType.SUBGRAPH, 0xb0000001);
      expect(result).toBe(false);
    }).not.toThrow();
  });
});
