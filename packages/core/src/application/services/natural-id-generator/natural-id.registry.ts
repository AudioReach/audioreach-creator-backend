/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {NaturalIdGenerator} from '../../../domain/services/natural-id-generator/natural-id-generator.js';
import {NaturalIdType} from '../../../domain/services/natural-id-generator/natural-id-type.js';
import type {NaturalIdGenerationPort} from '../../ports/id-generation/natural-id-generation.port.js';
import type {VmidRemapping} from '../../../domain/services/natural-id-generator/vmid-remapping.js';

export class NaturalIdRegistry implements NaturalIdGenerationPort {
  private readonly generators = new Map<number, NaturalIdGenerator>();
  private readonly pendingInit = new Map<number, Promise<void>>();

  registerBatch(
    fileSystemId: number,
    entries: Array<{type: NaturalIdType; id: number}>,
  ): void {
    const gen = this.getOrCreate(fileSystemId);
    for (const {type, id} of entries) {
      gen.register(type, id);
    }
  }

  getNextId(fileSystemId: number, type: NaturalIdType): number {
    return this.getOrCreate(fileSystemId).allocate(type);
  }

  release(fileSystemId: number, type: NaturalIdType, id: number): boolean {
    return this.getOrCreate(fileSystemId).release(type, id);
  }

  setVmid(
    fileSystemId: number,
    vmid: number,
  ): {success: boolean; remappings: VmidRemapping[]} {
    return this.getOrCreate(fileSystemId).setVmid(vmid);
  }

  resetVmid(fileSystemId: number): VmidRemapping[] {
    return this.getOrCreate(fileSystemId).resetVmid();
  }

  getVmid(fileSystemId: number): number {
    return this.getOrCreate(fileSystemId).getVmid();
  }

  getRange(
    fileSystemId: number,
    type: NaturalIdType,
  ): {min: number; max: number} {
    return this.getOrCreate(fileSystemId).getRange(type);
  }

  getRangeForVmid(
    type: NaturalIdType,
    vmid: number,
  ): {min: number; max: number} {
    // Stateless: delegates to a temporary generator; no per-file state needed
    return new NaturalIdGenerator().getRangeForVmid(type, vmid);
  }

  async ensureLoaded(
    fileSystemId: number,
    loader: () => Promise<Array<{type: NaturalIdType; id: number}>>,
  ): Promise<void> {
    if (this.generators.has(fileSystemId)) return;

    if (!this.pendingInit.has(fileSystemId)) {
      const p = loader()
        .then(entries => {
          return this.registerBatch(fileSystemId, entries);
        })
        .finally(() => {
          this.pendingInit.delete(fileSystemId);
        });
      this.pendingInit.set(fileSystemId, p);
    }

    await this.pendingInit.get(fileSystemId)!;
  }

  private getOrCreate(fileSystemId: number): NaturalIdGenerator {
    if (!this.generators.has(fileSystemId)) {
      this.generators.set(fileSystemId, new NaturalIdGenerator());
    }
    return this.generators.get(fileSystemId)!;
  }
}
