/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export class BinaryDataWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset = 0;

  constructor(initialCapacity = 256) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
  }

  private grow(needed: number): void {
    if (this.offset + needed <= this.buffer.byteLength) return;
    let next = this.buffer.byteLength;
    while (next < this.offset + needed) next *= 2;
    const newBuf = new ArrayBuffer(next);
    new Uint8Array(newBuf).set(new Uint8Array(this.buffer, 0, this.offset));
    this.buffer = newBuf;
    this.view = new DataView(this.buffer);
  }

  writeInt8(v: number): void {
    this.grow(1);
    this.view.setInt8(this.offset, v);
    this.offset += 1;
  }
  writeUInt8(v: number): void {
    this.grow(1);
    this.view.setUint8(this.offset, v);
    this.offset += 1;
  }
  writeInt16(v: number): void {
    this.grow(2);
    this.view.setInt16(this.offset, v, true);
    this.offset += 2;
  }
  writeUInt16(v: number): void {
    this.grow(2);
    this.view.setUint16(this.offset, v, true);
    this.offset += 2;
  }
  writeInt32(v: number): void {
    this.grow(4);
    this.view.setInt32(this.offset, v, true);
    this.offset += 4;
  }
  writeUInt32(v: number): void {
    this.grow(4);
    this.view.setUint32(this.offset, v, true);
    this.offset += 4;
  }
  writeFloat(v: number): void {
    this.grow(4);
    this.view.setFloat32(this.offset, v, true);
    this.offset += 4;
  }
  writeDouble(v: number): void {
    this.grow(8);
    this.view.setFloat64(this.offset, v, true);
    this.offset += 8;
  }

  writeInt64(v: bigint): void {
    this.grow(8);
    this.view.setBigInt64(this.offset, v, true);
    this.offset += 8;
  }

  writeUInt64(v: bigint): void {
    this.grow(8);
    this.view.setBigUint64(this.offset, v, true);
    this.offset += 8;
  }

  writeRawData(v: Uint8Array): void {
    this.grow(v.byteLength);
    new Uint8Array(this.buffer).set(v, this.offset);
    this.offset += v.byteLength;
  }

  align(alignment: number): void {
    const remainder = this.offset % alignment;
    if (remainder === 0) return;
    const padding = alignment - remainder;
    this.grow(padding);
    new Uint8Array(this.buffer).fill(0, this.offset, this.offset + padding);
    this.offset += padding;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }
}
