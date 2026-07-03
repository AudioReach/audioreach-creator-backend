/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {NaturalIdGenerator} from '../../../../src/domain/services/natural-id-generator/natural-id-generator.js';
import {NaturalIdType} from '../../../../src/domain/services/natural-id-generator/natural-id-type.js';

describe('UniqueIdGenerator', () => {
  let gen: NaturalIdGenerator;

  beforeEach(() => {
    gen = new NaturalIdGenerator();
  });

  // ── Allocate ────────────────────────────────────────────────────────────────

  it('allocate-01: empty set → returns 0xB0000001 for SUBGRAPH', () => {
    expect(gen.allocate(NaturalIdType.SUBGRAPH)).toBe(0xb0000001);
  });

  it('allocate-02: min already used → returns 0xB0000002', () => {
    gen.allocate(NaturalIdType.SUBGRAPH);
    expect(gen.allocate(NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
  });

  it('allocate-03: ALL IDs in range used → returns max + 1 (overflow sentinel)', () => {
    const small = new NaturalIdGenerator();
    // Fill the entire SUBGRAPH range via internal state directly
    for (let id = 0xb0000001; id <= 0xb0ffffff; id++) {
      (small as any)['state'][NaturalIdType.SUBGRAPH].usedIds.add(id);
    }
    (small as any)['state'][NaturalIdType.SUBGRAPH].watermark = 0xb0ffffff;
    expect(small.allocate(NaturalIdType.SUBGRAPH)).toBe(0xb0ffffff + 1);
  });

  // ── Register ────────────────────────────────────────────────────────────────

  it('register-01: valid unused ID → returns true; isUsed returns true', () => {
    expect(gen.register(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(true);
    expect(gen.isUsed(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(true);
  });

  it('register-02: out-of-range ID → returns false', () => {
    expect(gen.register(NaturalIdType.SUBGRAPH, 0xc0000001)).toBe(false);
  });

  it('register-03: already-used ID → returns false', () => {
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000010);
    expect(gen.register(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(false);
  });

  // ── Release ─────────────────────────────────────────────────────────────────

  it('release-01: known ID → returns true; isUsed returns false', () => {
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000010);
    expect(gen.release(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(true);
    expect(gen.isUsed(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(false);
  });

  it('release-02: unknown ID → returns false', () => {
    expect(gen.release(NaturalIdType.SUBGRAPH, 0xb0000010)).toBe(false);
  });

  it('release-03: CONTAINER only — freed ID is reallocated by next allocate (no watermark)', () => {
    gen.register(NaturalIdType.CONTAINER, 0xe0000001);
    gen.release(NaturalIdType.CONTAINER, 0xe0000001);
    expect(gen.allocate(NaturalIdType.CONTAINER)).toBe(0xe0000001);
  });

  // ── Monotonicity (watermark) ─────────────────────────────────────────────────

  it('watermark-01: SUBGRAPH first allocate sets watermark; second allocate returns next ID', () => {
    const first = gen.allocate(NaturalIdType.SUBGRAPH);
    const second = gen.allocate(NaturalIdType.SUBGRAPH);
    expect(first).toBe(0xb0000001);
    expect(second).toBe(0xb0000002);
  });

  it('watermark-02: after allocate(0xB0000005), release(SUBGRAPH, 0xB0000001), next allocate returns 0xB0000006 not 0xB0000001', () => {
    for (let i = 0; i < 5; i++) gen.allocate(NaturalIdType.SUBGRAPH);
    gen.release(NaturalIdType.SUBGRAPH, 0xb0000001);
    expect(gen.allocate(NaturalIdType.SUBGRAPH)).toBe(0xb0000006);
  });

  it('watermark-03: MODINSTANCE has the same monotonicity as SUBGRAPH', () => {
    const first = gen.allocate(NaturalIdType.MODINSTANCE);
    gen.release(NaturalIdType.MODINSTANCE, first);
    const second = gen.allocate(NaturalIdType.MODINSTANCE);
    expect(second).toBe(first + 1);
  });

  it('watermark-04: release(SUBGRAPH, id) where id > watermark → next allocate skips past it', () => {
    gen.allocate(NaturalIdType.SUBGRAPH); // 0xB0000001, watermark=0xB0000001
    gen.allocate(NaturalIdType.SUBGRAPH); // 0xB0000002, watermark=0xB0000002
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000010);
    gen.release(NaturalIdType.SUBGRAPH, 0xb0000010); // watermark advances to 0xB0000010
    expect(gen.allocate(NaturalIdType.SUBGRAPH)).toBe(0xb0000011);
  });

  // ── VMID ─────────────────────────────────────────────────────────────────────

  it('vmid-01: setVmid(1) on empty generator — remappings empty; getVmid() returns 1; getRange(SUBGRAPH) returns new range', () => {
    const result = gen.setVmid(1);
    expect(result.remappings).toHaveLength(0);
    expect(gen.getVmid()).toBe(1);
    expect(gen.getRange(NaturalIdType.SUBGRAPH)).toEqual({
      min: 0xb1000001,
      max: 0xb1ffffff,
    });
  });

  it('vmid-02: register 0xB0000001, then setVmid(1) — remapping has correct entry; isUsed for new ID is true', () => {
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000001);
    const {remappings} = gen.setVmid(1);
    expect(remappings).toHaveLength(1);
    expect(remappings[0]).toEqual({
      type: NaturalIdType.SUBGRAPH,
      oldId: 0xb0000001,
      newId: 0xb1000001,
    });
    expect(gen.isUsed(NaturalIdType.SUBGRAPH, 0xb1000001)).toBe(true);
  });

  it('vmid-03: SUBSYSTEM IDs unchanged by setVmid — isUsed(SUBSYSTEM, 0xF0000001) still true after setVmid(1)', () => {
    gen.register(NaturalIdType.SUBSYSTEM, 0xf0000001);
    gen.setVmid(1);
    expect(gen.isUsed(NaturalIdType.SUBSYSTEM, 0xf0000001)).toBe(true);
  });

  it('vmid-04: resetVmid() after setVmid(1) — IDs remapped back to VMID=0; getVmid() returns 0xFFFFFFFF', () => {
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000001);
    gen.setVmid(1);
    expect(gen.isUsed(NaturalIdType.SUBGRAPH, 0xb1000001)).toBe(true);
    gen.resetVmid();
    expect(gen.isUsed(NaturalIdType.SUBGRAPH, 0xb0000001)).toBe(true);
    expect(gen.getVmid()).toBe(0xffffffff);
  });

  it('vmid-05: getVmid() returns 0xFFFFFFFF on a fresh generator (no setVmid called)', () => {
    expect(gen.getVmid()).toBe(0xffffffff);
  });

  it('vmid-06: getRangeForVmid(SUBGRAPH, 2) returns correct range without mutating state', () => {
    const vmid2Range = gen.getRangeForVmid(NaturalIdType.SUBGRAPH, 2);
    expect(vmid2Range).toEqual({min: 0xb2000001, max: 0xb2ffffff});
    expect(gen.getRange(NaturalIdType.SUBGRAPH)).toEqual({
      min: 0xb0000001,
      max: 0xb0ffffff,
    });
  });

  it('vmid-07: getRangeForVmid(SUBSYSTEM, 5) returns fixed SUBSYSTEM baseline range', () => {
    const range = gen.getRangeForVmid(NaturalIdType.SUBSYSTEM, 5);
    expect(range).toEqual({min: 0xf0000001, max: 0xf0ffffff});
  });

  // ── Diagnostics ──────────────────────────────────────────────────────────────

  it('diag-01: getMax(SUBGRAPH) returns 0 on empty; returns correct max after two register calls', () => {
    expect(gen.getMax(NaturalIdType.SUBGRAPH)).toBe(0);
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000003);
    gen.register(NaturalIdType.SUBGRAPH, 0xb0000007);
    expect(gen.getMax(NaturalIdType.SUBGRAPH)).toBe(0xb0000007);
  });

  it('diag-02: lastUsedTimestamp(SUBGRAPH) is a non-empty ISO string after allocate', () => {
    gen.allocate(NaturalIdType.SUBGRAPH);
    const ts = gen.lastUsedTimestamp(NaturalIdType.SUBGRAPH);
    expect(ts).not.toBe('');
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('diag-03: lastUsedId(SUBGRAPH) updates on both allocate and release', () => {
    gen.allocate(NaturalIdType.SUBGRAPH); // 0xB0000001
    expect(gen.lastUsedId(NaturalIdType.SUBGRAPH)).toBe(0xb0000001);
    gen.allocate(NaturalIdType.SUBGRAPH); // 0xB0000002
    expect(gen.lastUsedId(NaturalIdType.SUBGRAPH)).toBe(0xb0000002);
    gen.release(NaturalIdType.SUBGRAPH, 0xb0000001);
    expect(gen.lastUsedId(NaturalIdType.SUBGRAPH)).toBe(0xb0000001);
  });
});
