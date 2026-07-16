/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UsecaseBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/usecase-builder.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {USECASE_TYPE} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';
import type {UsecaseEntry} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/usecase-data-chunk.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {asSystemId} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../../../../src/shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../../../../src/shared/types/subgraph-pair.js';

describe('UsecaseBuilder', () => {
  let builder: UsecaseBuilder;
  let mockLogger: jest.Mocked<Logger>;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();

    let idCounter = 0;
    mockIdGenerator.getNextId.mockImplementation(async () => {
      idCounter++;
      return idCounter;
    });

    mockForeignKeyMapper.getValueSystemId.mockImplementation(() =>
      asSystemId(500),
    );

    // Return distinct subgraph system IDs by natural subgraph ID
    mockForeignKeyMapper.getSubgraphSystemId.mockImplementation(naturalId => {
      return asSystemId(1000 + (naturalId as unknown as number));
    });

    builder = new UsecaseBuilder(
      mockIdGenerator,
      mockForeignKeyMapper,
      mockLogger,
    );
  });

  describe('buildUsecases', () => {
    describe('Happy Path', () => {
      it('should build usecases successfully with system IDs assigned', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(1, 10),
              new KeyValue(2, 20),
            ]),
            sgPropOffset: 0,
            sgList: [1, 2],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(3, 30),
              new KeyValue(4, 40),
            ]),
            sgPropOffset: 0,
            sgList: [3],
            sgPairList: [new SubgraphPair(1, 2)],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(2);
        expect(result[0].systemId).toBeGreaterThan(0);
        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
        expect(result[0].keyVector.valueSystemIds).toEqual([500, 500]);
        expect(result[0].subgraphSystemIds.length).toBeGreaterThan(0);
        expect(result[1].subgraphPairs).toHaveLength(1);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
      });

      it('should handle empty input arrays', async () => {
        const result = await builder.buildUsecases([], TEST_FILE_SYSTEM_ID);
        expect(result).toEqual([]);
      });

      it('should log completion message', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('system IDs assigned'),
            action: 'usecase_conversion_complete',
            component: 'UsecaseBuilder',
          }),
        );
      });

      it('should assign unique system IDs to each usecase', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        const systemIds = result.map(uc => uc.systemId);
        expect(new Set(systemIds).size).toBe(systemIds.length);
      });

      it('should add subgraph system IDs from sgList', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1, 2],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].subgraphSystemIds).toHaveLength(2);
        expect(result[0].subgraphSystemIds).toEqual([1001, 1002]);
      });

      it('should add subgraph pairs from sgPairList', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [1, 2],
            sgPairList: [new SubgraphPair(1, 2)],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].subgraphPairs).toHaveLength(1);
        expect(result[0].subgraphPairs[0]).toEqual({
          sourceSubgraphSystemId: 1001,
          destSubgraphSystemId: 1002,
        });
      });

      it('should handle usecases with no subgraphs', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].subgraphSystemIds).toHaveLength(0);
        expect(result[0].subgraphPairs).toHaveLength(0);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array when input is null', async () => {
        const result = await builder.buildUsecases(
          null as any,
          TEST_FILE_SYSTEM_ID,
        );
        expect(result).toEqual([]);
      });

      it('should return empty array when input is undefined', async () => {
        const result = await builder.buildUsecases(
          undefined as any,
          TEST_FILE_SYSTEM_ID,
        );
        expect(result).toEqual([]);
      });

      it('should log warning when subgraph mapping is missing', async () => {
        mockForeignKeyMapper.getSubgraphSystemId.mockReturnValue(undefined);

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [99],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
        expect(result[0].subgraphSystemIds).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'subgraph_mapping_missing',
          }),
        );
      });
    });

    describe('Error Handling', () => {
      it('should skip usecase when no key-value pairs exist', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
        expect(mockLogger.logWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: expect.stringContaining('Failed to convert usecase entry'),
            action: 'usecase_conversion_failed',
          }),
        );
      });

      it('should skip usecase when all key-value mappings fail', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(0);
      });

      it('should continue processing after a conversion failure', async () => {
        let callCount = 0;
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockImplementation(() => {
            callCount++;
            return callCount === 1 ? null : asSystemId(500);
          }) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result).toHaveLength(1);
      });
    });

    describe('Logging', () => {
      it('should log success and error counts', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue(500) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockLogger.logInfo).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Converted 1 usecases successfully, 1 failed, system IDs assigned',
            action: 'usecase_conversion_complete',
          }),
        );
      });

      it('should not log when no logger is provided', async () => {
        const builderWithoutLogger = new UsecaseBuilder(
          mockIdGenerator,
          mockForeignKeyMapper,
        );

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await expect(
          builderWithoutLogger.buildUsecases(
            usecaseEntries,
            TEST_FILE_SYSTEM_ID,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('System ID Assignment', () => {
      it('should call idGenerator.getNextId for each usecase', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(2, 20)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(2);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(
          TEST_FILE_SYSTEM_ID,
        );
      });

      it('should not call idGenerator when all usecases fail conversion', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValue(null) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        await builder.buildUsecases(usecaseEntries, TEST_FILE_SYSTEM_ID);

        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });
    });

    describe('UseCase Entity', () => {
      it('should create UseCase instances', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0]).toBeInstanceOf(UseCase);
      });

      it('should set fileSystemId correctly', async () => {
        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([new KeyValue(1, 10)]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].fileSystemId).toBe(TEST_FILE_SYSTEM_ID);
      });

      it('should populate keyVector with value system IDs', async () => {
        mockForeignKeyMapper.getValueSystemId = jest
          .fn()
          .mockReturnValueOnce(501)
          .mockReturnValueOnce(502)
          .mockReturnValueOnce(503) as any;

        const usecaseEntries: UsecaseEntry[] = [
          {
            keyValuePairList: new KeyValuePairList([
              new KeyValue(1, 10),
              new KeyValue(2, 20),
              new KeyValue(3, 30),
            ]),
            sgPropOffset: 0,
            sgList: [],
            sgPairList: [],
          },
        ];

        const result = await builder.buildUsecases(
          usecaseEntries,
          TEST_FILE_SYSTEM_ID,
        );

        expect(result[0].keyVector.valueSystemIds).toEqual([501, 502, 503]);
      });
    });
  });

  describe('UsecaseBuilder type from ui-metadata', () => {
    it('should assign type when GKV set matches a ui-metadata usecase entry', async () => {
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(999));
      mockForeignKeyMapper.getSubgraphSystemId.mockReturnValue(asSystemId(100));

      const uiMetadata = {
        version: {major: 1, minor: 0},
        payloadMap: [],
        subsystems: [],
        subgraphs: [],
        modules: [],
        dataLinks: [],
        usecases: [
          {type: USECASE_TYPE.Ec, keyValue: '[0xA2000000: 0xA3000000]'},
        ],
      };

      const usecaseEntry: UsecaseEntry = {
        keyValuePairList: {
          keyValueList: [{keyId: 0xa2000000, value: 0xa3000000}],
        },
        sgList: [],
        sgPairList: [],
      };

      const usecases = await builder.buildUsecases(
        [usecaseEntry],
        TEST_FILE_SYSTEM_ID,
        undefined,
        uiMetadata as any,
      );
      expect(usecases[0].type).toBe(USECASE_TYPE.Ec);
    });

    it('should leave type undefined when no ui-metadata GKV match', async () => {
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(999));
      const uiMetadata = {
        version: {major: 1, minor: 0},
        payloadMap: [],
        subsystems: [],
        subgraphs: [],
        modules: [],
        dataLinks: [],
        usecases: [],
      };
      const usecaseEntry: UsecaseEntry = {
        keyValuePairList: {keyValueList: [{keyId: 0xa2, value: 0xa3}]},
        sgList: [],
        sgPairList: [],
      };
      const usecases = await builder.buildUsecases(
        [usecaseEntry],
        TEST_FILE_SYSTEM_ID,
        undefined,
        uiMetadata as any,
      );
      expect(usecases[0].type).toBeUndefined();
    });
  });
});
