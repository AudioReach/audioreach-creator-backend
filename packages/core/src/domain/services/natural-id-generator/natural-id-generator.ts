/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NaturalIdType} from './natural-id-type.js';
import type {VmidRemapping} from './vmid-remapping.js';

const VMID_SENTINEL = 0xff_ff_ff_ff;
const VMID_MASK = 0x0f_00_00_00;
const VMID_CLEAR = 0xf0_ff_ff_ff;

const BASELINE_RANGES: Record<NaturalIdType, {min: number; max: number}> = {
  [NaturalIdType.SUBGRAPH]: {min: 0xb0_00_00_01, max: 0xb0_ff_ff_ff},
  [NaturalIdType.CONTAINER]: {min: 0xe0_00_00_01, max: 0xe0_ff_ff_ff},
  [NaturalIdType.MODINSTANCE]: {min: 0x00_00_40_01, max: 0x00_ff_ff_ff},
  [NaturalIdType.SUBSYSTEM]: {min: 0xf0_00_00_01, max: 0xf0_ff_ff_ff},
};

const VMID_AFFECTED = new Set([
  NaturalIdType.SUBGRAPH,
  NaturalIdType.CONTAINER,
  NaturalIdType.MODINSTANCE,
]);

const HAS_WATERMARK = new Set([
  NaturalIdType.SUBGRAPH,
  NaturalIdType.MODINSTANCE,
]);

function applyVmid(id: number, vmid: number): number {
  return ((id & VMID_CLEAR) | ((vmid << 24) & VMID_MASK)) >>> 0;
}

interface TypeState {
  usedIds: Set<number>;
  min: number;
  max: number;
  watermark: number;
  lastUsedId: number;
  lastUsedTimestamp: string;
}

function makeState(range: {min: number; max: number}): TypeState {
  return {
    usedIds: new Set(),
    min: range.min,
    max: range.max,
    watermark: 0,
    lastUsedId: 0,
    lastUsedTimestamp: '',
  };
}

export class NaturalIdGenerator {
  private vmid: number = VMID_SENTINEL;
  private readonly state: Record<NaturalIdType, TypeState>;

  constructor() {
    this.state = {
      [NaturalIdType.SUBGRAPH]: makeState(
        BASELINE_RANGES[NaturalIdType.SUBGRAPH],
      ),
      [NaturalIdType.CONTAINER]: makeState(
        BASELINE_RANGES[NaturalIdType.CONTAINER],
      ),
      [NaturalIdType.MODINSTANCE]: makeState(
        BASELINE_RANGES[NaturalIdType.MODINSTANCE],
      ),
      [NaturalIdType.SUBSYSTEM]: makeState(
        BASELINE_RANGES[NaturalIdType.SUBSYSTEM],
      ),
    };
  }

  allocate(type: NaturalIdType): number {
    const s = this.state[type];
    const scanStart =
      HAS_WATERMARK.has(type) && s.watermark > 0 ? s.watermark + 1 : s.min;
    for (let i = scanStart; i <= s.max; i++) {
      if (!s.usedIds.has(i)) {
        s.usedIds.add(i);
        if (HAS_WATERMARK.has(type)) s.watermark = i;
        s.lastUsedId = i;
        s.lastUsedTimestamp = new Date().toISOString();
        return i;
      }
    }
    return s.max + 1;
  }

  register(type: NaturalIdType, id: number): boolean {
    const s = this.state[type];
    if (id < s.min || id > s.max) return false;
    if (s.usedIds.has(id)) return false;
    s.usedIds.add(id);
    s.lastUsedId = id;
    s.lastUsedTimestamp = new Date().toISOString();
    return true;
  }

  release(type: NaturalIdType, id: number): boolean {
    const s = this.state[type];
    if (!s.usedIds.has(id)) return false;
    s.usedIds.delete(id);
    if (HAS_WATERMARK.has(type) && id > s.watermark) s.watermark = id;
    s.lastUsedId = id;
    s.lastUsedTimestamp = new Date().toISOString();
    return true;
  }

  isUsed(type: NaturalIdType, id: number): boolean {
    return this.state[type].usedIds.has(id);
  }

  getRange(type: NaturalIdType): {min: number; max: number} {
    return {min: this.state[type].min, max: this.state[type].max};
  }

  getRangeForVmid(
    type: NaturalIdType,
    vmid: number,
  ): {min: number; max: number} {
    if (!VMID_AFFECTED.has(type)) {
      return {
        min: BASELINE_RANGES[type].min,
        max: BASELINE_RANGES[type].max,
      };
    }
    return {
      min: applyVmid(BASELINE_RANGES[type].min, vmid),
      max: applyVmid(BASELINE_RANGES[type].max, vmid),
    };
  }

  setVmid(vmid: number): {success: boolean; remappings: VmidRemapping[]} {
    if (vmid < 0 || vmid > 15) return {success: false, remappings: []};
    const remappings: VmidRemapping[] = [];
    for (const type of VMID_AFFECTED) {
      const s = this.state[type];
      s.min = applyVmid(BASELINE_RANGES[type].min, vmid);
      s.max = applyVmid(BASELINE_RANGES[type].max, vmid);
      const newIds = new Set<number>();
      for (const id of s.usedIds) {
        const newId = applyVmid(id, vmid);
        if (newId !== id) remappings.push({type, oldId: id, newId});
        newIds.add(newId);
      }
      s.usedIds = newIds;
    }
    this.vmid = vmid;
    return {success: true, remappings};
  }

  resetVmid(): VmidRemapping[] {
    const {remappings} = this.setVmid(0);
    this.vmid = VMID_SENTINEL;
    return remappings;
  }

  getVmid(): number {
    return this.vmid;
  }

  lastUsedId(type: NaturalIdType): number {
    return this.state[type].lastUsedId;
  }

  lastUsedTimestamp(type: NaturalIdType): string {
    return this.state[type].lastUsedTimestamp;
  }

  getMax(type: NaturalIdType): number {
    const s = this.state[type];
    if (s.usedIds.size === 0) return 0;
    return Math.max(...s.usedIds);
  }
}
