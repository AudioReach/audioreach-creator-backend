/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {
  UiMetadataSchema,
  parseKeyValueString,
} from '../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/ui-metadata/ui-metadata.schema.js';

describe('UiMetadataSchema', () => {
  it('should parse a minimal valid payload', () => {
    const result = UiMetadataSchema.parse({
      version: {major: 1, minor: 0},
    });
    expect(result.version.major).toBe(1);
    expect(result.payloadMap).toEqual([]);
    expect(result.usecases).toEqual([]);
    expect(result.subsystems).toEqual([]);
    expect(result.subgraphs).toEqual([]);
    expect(result.modules).toEqual([]);
    expect(result.dataLinks).toEqual([]);
  });

  it('should coerce hex string subsystem id to number', () => {
    const result = UiMetadataSchema.parse({
      version: {major: 1, minor: 0},
      subsystems: [{id: '0xF0100001', name: 'StreamRx', children: []}],
    });
    expect(result.subsystems[0].id).toBe(0xf0100001);
  });

  it('should parse a subsystem with filteredGraphKeys and children', () => {
    const result = UiMetadataSchema.parse({
      version: {major: 1, minor: 0},
      subsystems: [
        {
          id: '0xF0100001',
          name: 'StreamRx',
          filteredGraphKeys: '0xAB000000,0xA1000000',
          children: [
            {id: '0xB00000C6', type: 'Subgraph'},
            {id: '0xF0100002', type: 'Subsystem'},
          ],
        },
      ],
    });
    expect(result.subsystems[0].filteredGraphKeys).toBe(
      '0xAB000000,0xA1000000',
    );
    expect(result.subsystems[0].children).toHaveLength(2);
    expect(result.subsystems[0].children[0].type).toBe('Subgraph');
  });

  it('should parse module calViewUiPersistences with and without calKeyValue', () => {
    const result = UiMetadataSchema.parse({
      version: {major: 1, minor: 0},
      modules: [
        {
          definitionId: '0x07001017',
          instanceId: '0x00004046',
          calViewUiPersistences: [
            {payloadId: 'abc', calKeyValue: '[08001164: 08001168]'},
            {payloadId: 'def'},
          ],
        },
      ],
    });
    expect(result.modules[0].instanceId).toBe(0x00004046);
    expect(result.modules[0].calViewUiPersistences[0].calKeyValue).toBe(
      '[08001164: 08001168]',
    );
    expect(
      result.modules[0].calViewUiPersistences[1].calKeyValue,
    ).toBeUndefined();
  });

  it('should parse dataLinks with isEcLink', () => {
    const result = UiMetadataSchema.parse({
      version: {major: 1, minor: 0},
      dataLinks: [
        {
          isEcLink: true,
          sourceId: '0x0000418E',
          sourcePortId: '0x0000000D',
          destinationId: '0x00004160',
          destinationPortId: '0x00000002',
        },
      ],
    });
    expect(result.dataLinks[0].isEcLink).toBe(true);
    expect(result.dataLinks[0].sourcePortId).toBe(0x0000000d);
  });

  it('should fail on invalid version structure', () => {
    expect(() =>
      UiMetadataSchema.parse({version: {major: 'x', minor: 0}}),
    ).toThrow();
  });

  it('should accept unknown child type (C# compatibility)', () => {
    expect(() =>
      UiMetadataSchema.parse({
        version: {major: 1, minor: 0},
        subsystems: [
          {
            id: '0xF0100001',
            name: 'S',
            children: [{id: '0xAB', type: 'Unknown'}],
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe('parseKeyValueString', () => {
  it('should parse a single pair with 0x prefix', () => {
    expect(parseKeyValueString('[0xA1000000: 0xA2000001]')).toEqual([
      {keyId: 0xa1000000, valueId: 0xa2000001},
    ]);
  });

  it('should parse a single pair without 0x prefix', () => {
    expect(parseKeyValueString('[A1000000: A2000001]')).toEqual([
      {keyId: 0xa1000000, valueId: 0xa2000001},
    ]);
  });

  it('should parse multiple pairs', () => {
    const result = parseKeyValueString(
      '[0xA1000000: 0xA2000001] [0xA3000000: 0xA4000002]',
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({keyId: 0xa1000000, valueId: 0xa2000001});
    expect(result[1]).toEqual({keyId: 0xa3000000, valueId: 0xa4000002});
  });

  it('should return empty array for empty string', () => {
    expect(parseKeyValueString('')).toEqual([]);
  });

  it('should return empty array for whitespace', () => {
    expect(parseKeyValueString('   ')).toEqual([]);
  });
});
