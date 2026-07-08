/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * Sequential binary reader that advances an internal offset after each read.
 *
 * Wraps a `DataView` over a `Uint8Array` and provides typed read methods for
 * all scalar data types supported by the parameter structure schema.
 * All multi-byte reads use little-endian byte order.
 */
export class BinaryDataReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readUInt8(): number {
    if (this.offset + 1 > this.view.byteLength)
      throw new Error('Buffer overflow');
    return this.view.getUint8(this.offset++);
  }
  readUInt16(): number {
    if (this.offset + 2 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readUInt32(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readInt8(): number {
    if (this.offset + 1 > this.view.byteLength)
      throw new Error('Buffer overflow');
    return this.view.getInt8(this.offset++);
  }
  readInt16(): number {
    if (this.offset + 2 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readInt32(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readFloat(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readDouble(): number {
    if (this.offset + 8 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }
  readUInt64(): bigint {
    if (this.offset + 8 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }
  readInt64(): bigint {
    if (this.offset + 8 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }
  /**
   * Reads all remaining bytes as a raw byte slice without copying.
   * Used for `RawData` elements that consume the rest of the payload.
   */
  readRawData(length: number): Uint8Array {
    if (this.offset + length > this.view.byteLength)
      throw new Error('Buffer overflow');
    const d = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    );
    this.offset += length;
    return d;
  }
  /** Returns the number of bytes not yet consumed by the reader. */
  getRemainingBytes(): number {
    return this.view.byteLength - this.offset;
  }

  /**
   * Advances the offset to the next multiple of `alignment`.
   * No-op when the current offset is already aligned.
   */
  align(alignment: number): void {
    const remainder = this.offset % alignment;
    if (remainder !== 0) this.offset += alignment - remainder;
  }
}
