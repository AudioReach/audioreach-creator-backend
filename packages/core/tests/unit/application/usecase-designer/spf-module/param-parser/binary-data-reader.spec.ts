/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BinaryDataReader} from '../../../../../../src/application/usecase-designer/shared/utils/binary-data-reader.js';

function makeReader(...bytes: number[]): BinaryDataReader {
  return new BinaryDataReader(new Uint8Array(bytes));
}

function float32Bytes(value: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  return [...new Uint8Array(buf)];
}

function float64Bytes(value: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true);
  return [...new Uint8Array(buf)];
}

describe('BinaryDataReader', () => {
  describe('readUInt8', () => {
    it('reads a single byte', () => {
      expect(makeReader(0x42).readUInt8()).toBe(0x42);
    });

    it('advances offset after read', () => {
      const r = makeReader(0x01, 0x02);
      expect(r.readUInt8()).toBe(0x01);
      expect(r.readUInt8()).toBe(0x02);
    });

    it('throws on overflow', () => {
      expect(() => makeReader().readUInt8()).toThrow('Buffer overflow');
    });
  });

  describe('readUInt16', () => {
    it('reads little-endian UInt16', () => {
      expect(makeReader(0x01, 0x00).readUInt16()).toBe(1);
      expect(makeReader(0xff, 0x00).readUInt16()).toBe(255);
      expect(makeReader(0x00, 0x01).readUInt16()).toBe(256);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01).readUInt16()).toThrow('Buffer overflow');
    });
  });

  describe('readUInt32', () => {
    it('reads little-endian UInt32', () => {
      expect(makeReader(0x05, 0x00, 0x00, 0x00).readUInt32()).toBe(5);
      expect(makeReader(0xff, 0xff, 0xff, 0xff).readUInt32()).toBe(0xffffffff);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01, 0x02, 0x03).readUInt32()).toThrow(
        'Buffer overflow',
      );
    });
  });

  describe('readUInt64', () => {
    it('reads little-endian UInt64', () => {
      const r = makeReader(0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
      expect(r.readUInt64()).toBe(1n);
    });

    it('throws on overflow', () => {
      expect(() =>
        makeReader(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07).readUInt64(),
      ).toThrow('Buffer overflow');
    });
  });

  describe('readInt8', () => {
    it('reads positive value', () => {
      expect(makeReader(0x7f).readInt8()).toBe(127);
    });

    it('reads negative value', () => {
      expect(makeReader(0xff).readInt8()).toBe(-1);
    });

    it('throws on overflow', () => {
      expect(() => makeReader().readInt8()).toThrow('Buffer overflow');
    });
  });

  describe('readInt16', () => {
    it('reads positive little-endian Int16', () => {
      expect(makeReader(0x01, 0x00).readInt16()).toBe(1);
    });

    it('reads negative little-endian Int16', () => {
      expect(makeReader(0xff, 0xff).readInt16()).toBe(-1);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01).readInt16()).toThrow('Buffer overflow');
    });
  });

  describe('readInt32', () => {
    it('reads positive little-endian Int32', () => {
      expect(makeReader(0x0a, 0x00, 0x00, 0x00).readInt32()).toBe(10);
    });

    it('reads negative little-endian Int32', () => {
      expect(makeReader(0xff, 0xff, 0xff, 0xff).readInt32()).toBe(-1);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01, 0x02, 0x03).readInt32()).toThrow(
        'Buffer overflow',
      );
    });
  });

  describe('readInt64', () => {
    it('reads negative little-endian Int64', () => {
      const r = makeReader(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
      expect(r.readInt64()).toBe(-1n);
    });

    it('throws on overflow', () => {
      expect(() =>
        makeReader(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07).readInt64(),
      ).toThrow('Buffer overflow');
    });
  });

  describe('readFloat', () => {
    it('reads a Float32 value', () => {
      const r = makeReader(...float32Bytes(1.5));
      expect(r.readFloat()).toBeCloseTo(1.5);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01, 0x02, 0x03).readFloat()).toThrow(
        'Buffer overflow',
      );
    });
  });

  describe('readDouble', () => {
    it('reads a Float64 value', () => {
      const r = makeReader(...float64Bytes(3.14));
      expect(r.readDouble()).toBeCloseTo(3.14);
    });

    it('throws on overflow', () => {
      expect(() =>
        makeReader(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07).readDouble(),
      ).toThrow('Buffer overflow');
    });
  });

  describe('readRawData', () => {
    it('reads the requested number of bytes', () => {
      const r = makeReader(0x01, 0x02, 0x03, 0x04);
      const raw = r.readRawData(3);
      expect([...raw]).toEqual([0x01, 0x02, 0x03]);
    });

    it('advances offset after read', () => {
      const r = makeReader(0x01, 0x02, 0x03);
      r.readRawData(2);
      expect(r.getRemainingBytes()).toBe(1);
    });

    it('throws on overflow', () => {
      expect(() => makeReader(0x01, 0x02).readRawData(3)).toThrow(
        'Buffer overflow',
      );
    });
  });

  describe('getRemainingBytes', () => {
    it('returns full length before any reads', () => {
      expect(makeReader(0x01, 0x02, 0x03).getRemainingBytes()).toBe(3);
    });

    it('decreases after each read', () => {
      const r = makeReader(0x01, 0x02, 0x03, 0x04);
      r.readUInt8();
      expect(r.getRemainingBytes()).toBe(3);
      r.readUInt16();
      expect(r.getRemainingBytes()).toBe(1);
    });

    it('returns 0 when all bytes consumed', () => {
      const r = makeReader(0x01);
      r.readUInt8();
      expect(r.getRemainingBytes()).toBe(0);
    });
  });

  describe('align', () => {
    it('no-op when already aligned', () => {
      const r = makeReader(0x01, 0x02, 0x03, 0x04);
      r.readUInt8(); // offset = 1
      r.readUInt8(); // offset = 2
      r.align(2); // already aligned to 2
      expect(r.getRemainingBytes()).toBe(2);
    });

    it('advances offset to next alignment boundary', () => {
      const r = makeReader(0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00);
      r.readUInt8(); // offset = 1
      r.align(4); // advance to offset 4
      expect(r.getRemainingBytes()).toBe(4);
      expect(r.readUInt32()).toBe(5);
    });

    it('no-op when alignment is 1', () => {
      const r = makeReader(0x01, 0x02, 0x03);
      r.readUInt8(); // offset = 1
      r.align(1);
      expect(r.getRemainingBytes()).toBe(2);
    });
  });

  describe('sequential reads', () => {
    it('reads multiple values in sequence', () => {
      const r = makeReader(0x01, 0x02, 0x00, 0x03, 0x00, 0x00, 0x00);
      expect(r.readUInt8()).toBe(1);
      expect(r.readUInt16()).toBe(2);
      expect(r.readUInt32()).toBe(3);
      expect(r.getRemainingBytes()).toBe(0);
    });
  });
});
