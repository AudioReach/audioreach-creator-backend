import {describe, it, expect} from '@jest/globals';
import {UsecaseDataChunkParser} from '../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/usecase-data-chunk-parser.js';
import {CHUNK_TYPES} from '../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../src/shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../src/shared/types/subgraph-pair.js';
import {BinaryUtils} from '../../../../src/shared/utilities/binary-utils.js';

describe('UsecaseDataChunkParser', () => {
  let parser: UsecaseDataChunkParser;

  beforeEach(() => {
    parser = new UsecaseDataChunkParser();
  });

  it('should have correct chunk type', () => {
    expect(parser.chunkType).toBe(CHUNK_TYPES.GKV_TABLE);
  });

  it('should create KeyValue instances correctly', () => {
    const keyValue = new KeyValue(123, 456);
    expect(keyValue.keyId).toBe(123);
    expect(keyValue.value).toBe(456);
  });

  it('should create KeyValuePairList correctly', () => {
    const keyValues = [
      new KeyValue(1, 100),
      new KeyValue(2, 200),
      new KeyValue(3, 300),
    ];

    const kvpList = new KeyValuePairList(keyValues);

    expect(kvpList.keyValueList).toHaveLength(3);
    expect(kvpList.keyList).toEqual([1, 2, 3]);
    expect(kvpList.valueList).toEqual([100, 200, 300]);
  });

  it('should generate payload correctly', () => {
    const keyValues = [new KeyValue(0x12_34_56_78, 0x87_65_43_21)];
    const kvpList = new KeyValuePairList(keyValues);

    const payload = kvpList.generatePayload();
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(payload.length).toBe(8); // 2 uint32s = 8 bytes

    // Verify the binary data (little-endian)
    const view = new DataView(payload.buffer);
    expect(BinaryUtils.readUint32(view, 0)).toBe(0x12_34_56_78);
    expect(BinaryUtils.readUint32(view, 4)).toBe(0x87_65_43_21);
  });

  it('should handle equality correctly', () => {
    const keyValues1 = [new KeyValue(1, 100), new KeyValue(2, 200)];
    const keyValues2 = [new KeyValue(1, 100), new KeyValue(2, 200)];
    const keyValues3 = [new KeyValue(1, 100), new KeyValue(2, 201)];

    const kvpList1 = new KeyValuePairList(keyValues1);
    const kvpList2 = new KeyValuePairList(keyValues2);
    const kvpList3 = new KeyValuePairList(keyValues3);

    expect(kvpList1.equals(kvpList2)).toBe(true);
    expect(kvpList1.equals(kvpList3)).toBe(false);
  });

  it('should create SubgraphPair instances correctly', () => {
    const pair = new SubgraphPair(123, 456);
    expect(pair.source).toBe(123);
    expect(pair.destination).toBe(456);
  });

  it('should handle SubgraphPair equality correctly', () => {
    const pair1 = new SubgraphPair(1, 2);
    const pair2 = new SubgraphPair(1, 2);
    const pair3 = new SubgraphPair(1, 3);

    expect(pair1.equals(pair2)).toBe(true);
    expect(pair1.equals(pair3)).toBe(false);
  });

  it('should generate correct string representation for SubgraphPair', () => {
    const pair = new SubgraphPair(123, 456);
    expect(pair.toString()).toBe('SubgraphPair(123 -> 456)');
  });

  it('should clone SubgraphPair correctly', () => {
    const original = new SubgraphPair(123, 456);
    const cloned = original.clone();

    expect(cloned.source).toBe(original.source);
    expect(cloned.destination).toBe(original.destination);
    expect(cloned).not.toBe(original); // Different instances
    expect(cloned.equals(original)).toBe(true);
  });

  it('should throw error when GKV_TABLE chunk is missing', () => {
    const context = {
      rawChunks: new Map([[CHUNK_TYPES.GKV_LUT, new Uint8Array([1, 2, 3, 4])]]),
    };

    expect(() => {
      parser.parse(context);
    }).toThrow('GKV_TABLE chunk not found in context');
  });

  it('should throw error when GKV_LUT chunk is missing', () => {
    const context = {
      rawChunks: new Map([
        [CHUNK_TYPES.GKV_TABLE, new Uint8Array([1, 2, 3, 4])],
      ]),
    };

    expect(() => {
      parser.parse(context);
    }).toThrow('GKV_LUT chunk not found in context');
  });
});
