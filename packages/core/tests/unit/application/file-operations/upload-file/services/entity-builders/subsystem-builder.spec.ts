/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, beforeEach} from '@jest/globals';
import {SubsystemBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/subsystem-builder.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import type {UiMetadata} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/ui-metadata/index.js';

describe('SubsystemBuilder', () => {
  let builder: SubsystemBuilder;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockIdGenerator: ReturnType<typeof createMockIdGenerator>;
  let mockFkMapper: ReturnType<typeof createMockForeignKeyMapper>;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockFkMapper = createMockForeignKeyMapper();
    mockIdGenerator.getNextId.mockImplementation(async () => ++idCounter);
    mockFkMapper.getKeySystemId.mockReturnValue(asSystemId(999));
    mockFkMapper.getSubsystemSystemId.mockReturnValue(undefined);
    builder = new SubsystemBuilder(mockIdGenerator, mockFkMapper, mockLogger);
  });

  it('should return empty result for empty subsystem list', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subsystems: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
    };
    const result = await builder.build(meta.subsystems, 100);
    expect(result).toHaveLength(0);
  });

  it('should build a single root subsystem node', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [{id: 0xf0100001, name: 'StreamRx', children: []}],
    };
    const result = await builder.build(meta.subsystems, 100);
    expect(result).toHaveLength(1);
    expect(result[0].parentId).toBeUndefined();
    expect(result[0].name).toBe('StreamRx');
    expect(result[0].subsystemId).toBe(0xf0100001);
  });

  it('should set parentId for child subsystem', async () => {
    mockFkMapper.getSubsystemSystemId.mockReturnValueOnce(asSystemId(1)); // child resolves parent systemId
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'Parent',
          children: [{id: 0xf0100002, type: 'Subsystem'}],
        },
        {id: 0xf0100002, name: 'Child', children: []},
      ],
    };
    const result = await builder.build(meta.subsystems, 100);
    expect(result).toHaveLength(2);
    const child = result.find(s => s.subsystemId === 0xf0100002)!;
    expect(child.parentId).toBeDefined();
  });

  it('should register mapping in fk mapper for each subsystem', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [{id: 0xf0100001, name: 'S', children: []}],
    };
    await builder.build(meta.subsystems, 100);
    expect(mockFkMapper.addSubsystemMapping).toHaveBeenCalledWith(
      asNaturalId(0xf0100001),
      expect.any(Number),
    );
  });

  it('should populate filteredKeySystemIds from filteredGraphKeys', async () => {
    mockFkMapper.getKeySystemId.mockReturnValue(asSystemId(500));
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'S',
          filteredGraphKeys: '0xAB000000,0xA1000000',
          children: [],
        },
      ],
    };
    const result = await builder.build(meta.subsystems, 100);
    expect(result[0].filteredKeySystemIds).toEqual([500, 500]);
  });

  it('should skip unknown filtered keys and log a warning', async () => {
    mockFkMapper.getKeySystemId.mockReturnValue(undefined);
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'S',
          filteredGraphKeys: '0xDEAD0000',
          children: [],
        },
      ],
    };
    const result = await builder.build(meta.subsystems, 100);
    expect(result[0].filteredKeySystemIds).toEqual([]);
    expect(mockLogger.logWarn).toHaveBeenCalled();
  });
});
