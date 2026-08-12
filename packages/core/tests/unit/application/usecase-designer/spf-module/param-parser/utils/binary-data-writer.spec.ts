import {BinaryDataWriter} from '../../../../../../../src/application/usecase-designer/shared/utils/binary-data-writer.js';

describe('BinaryDataWriter', () => {
  it('writeInt8 and writeUInt8 produce correct single bytes', () => {
    const w = new BinaryDataWriter();
    w.writeInt8(-1);
    w.writeUInt8(255);
    const out = w.toUint8Array();
    expect(out[0]).toBe(0xff); // -1 as signed byte
    expect(out[1]).toBe(0xff); // 255 as unsigned byte
  });

  it('writeInt16 writes little-endian 2 bytes', () => {
    const w = new BinaryDataWriter();
    w.writeInt16(0x0102);
    const out = w.toUint8Array();
    expect(out[0]).toBe(0x02);
    expect(out[1]).toBe(0x01);
  });

  it('writeUInt32 writes little-endian 4 bytes', () => {
    const w = new BinaryDataWriter();
    w.writeUInt32(0xdeadbeef);
    const out = w.toUint8Array();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(0, true)).toBe(0xdeadbeef);
  });

  it('writeFloat writes 4-byte IEEE 754 little-endian', () => {
    const w = new BinaryDataWriter();
    w.writeFloat(1.5);
    const out = w.toUint8Array();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getFloat32(0, true)).toBeCloseTo(1.5);
  });

  it('writeDouble writes 8-byte IEEE 754 little-endian', () => {
    const w = new BinaryDataWriter();
    w.writeDouble(Math.PI);
    const out = w.toUint8Array();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getFloat64(0, true)).toBeCloseTo(Math.PI);
  });

  it('writeInt64 writes 8-byte little-endian bigint', () => {
    const w = new BinaryDataWriter();
    w.writeInt64(BigInt('0x0102030405060708'));
    const out = w.toUint8Array();
    expect(out[0]).toBe(0x08);
    expect(out[7]).toBe(0x01);
  });

  it('writeRawData appends bytes verbatim', () => {
    const w = new BinaryDataWriter();
    w.writeRawData(new Uint8Array([0xaa, 0xbb, 0xcc]));
    const out = w.toUint8Array();
    expect(Array.from(out)).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it('align(4) adds zero padding when not aligned', () => {
    const w = new BinaryDataWriter();
    w.writeUInt8(1); // 1 byte written → 3 bytes of padding needed
    w.align(4);
    const out = w.toUint8Array();
    expect(out.length).toBe(4);
    expect(out[1]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('align(4) adds no padding when already aligned', () => {
    const w = new BinaryDataWriter();
    w.writeUInt32(1); // exactly 4 bytes
    w.align(4);
    expect(w.toUint8Array().length).toBe(4);
  });

  it('toUint8Array returns only written bytes after buffer growth', () => {
    const w = new BinaryDataWriter(4); // tiny initial capacity
    for (let i = 0; i < 20; i++) w.writeUInt8(i);
    const out = w.toUint8Array();
    expect(out.length).toBe(20);
    expect(out[0]).toBe(0);
    expect(out[19]).toBe(19);
  });
});
