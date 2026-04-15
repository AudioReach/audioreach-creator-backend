/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {EntitySystemIdService} from '../../../../../../src/application/file-operations/upload-file/services/entity-system-id-service.js';
import {KeyDefinition} from '../../../../../../src/domain/entities/definitions/key-value/key-definition.js';
import {ValueDefinition} from '../../../../../../src/domain/entities/definitions/key-value/entities/value-definition.js';
import type {IdGenerationPort} from '../../../../../../src/application/ports/id-generation/id-generation.port.js';

describe('EntitySystemIdService', () => {
  let service: EntitySystemIdService;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;

  beforeEach(() => {
    mockIdGenerator = {
      getNextId: jest.fn(),
      reserveBlock: jest.fn(),
      persistLastUsedId: jest.fn(),
    } as jest.Mocked<IdGenerationPort>;

    service = new EntitySystemIdService(mockIdGenerator);
  });

  describe('assignSystemIdsToKeyDefinitions', () => {
    describe('Happy Path', () => {
      it('should assign fileSystemId to all key definitions', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef],
          999,
        );

        expect(result[0].fileSystemId).toBe(999);
      });

      it('should assign systemId to all key definitions', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef],
          999,
        );

        expect(result[0].systemId).toBe(1);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledWith(999);
      });

      it('should assign systemId to all value definitions', async () => {
        const valueDef1 = new ValueDefinition({
          systemId: 0,
          valueId: 10,
          name: 'Value 1',
          description: '',
          cHeaderEnumValue: '10',
        });

        const valueDef2 = new ValueDefinition({
          systemId: 0,
          valueId: 20,
          name: 'Value 2',
          description: '',
          cHeaderEnumValue: '20',
        });

        var values = [valueDef1, valueDef2];

        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
          values,
        });

        mockIdGenerator.getNextId
          .mockResolvedValueOnce(1) // Key systemId
          .mockResolvedValueOnce(101) // Value 1 systemId
          .mockResolvedValueOnce(102); // Value 2 systemId

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef],
          999,
        );

        expect(result[0].values[0].systemId).toBe(101);
        expect(result[0].values[1].systemId).toBe(102);
      });

      it('should call idGenerator.getNextId correct number of times', async () => {
        const valueDef1 = new ValueDefinition({
          systemId: 0,
          valueId: 10,
          name: 'Value 1',
          description: '',
          cHeaderEnumValue: '10',
        });

        const valueDef2 = new ValueDefinition({
          systemId: 0,
          valueId: 20,
          name: 'Value 2',
          description: '',
          cHeaderEnumValue: '20',
        });

        var values = [valueDef1, valueDef2];

        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
          values,
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        await service.assignSystemIdsToKeyDefinitions([keyDef], 999);

        // 1 call for key + 2 calls for values = 3 total
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(3);
      });

      it('should handle multiple key definitions', async () => {
        const keyDef1 = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key 1',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY_1',
            keyEnumValue: '100',
          },
        });

        const keyDef2 = new KeyDefinition({
          systemId: 0,
          keyId: 200,
          fileSystemId: 0,
          name: 'Test Key 2',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY_2',
            keyEnumValue: '200',
          },
        });

        mockIdGenerator.getNextId
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2);

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef1, keyDef2],
          999,
        );

        expect(result).toHaveLength(2);
        expect(result[0].systemId).toBe(1);
        expect(result[1].systemId).toBe(2);
        expect(result[0].fileSystemId).toBe(999);
        expect(result[1].fileSystemId).toBe(999);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty array when input is null', async () => {
        const result = await service.assignSystemIdsToKeyDefinitions(
          null as any,
          999,
        );

        expect(result).toEqual([]);
        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });

      it('should return empty array when input is undefined', async () => {
        const result = await service.assignSystemIdsToKeyDefinitions(
          undefined as any,
          999,
        );

        expect(result).toEqual([]);
        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });

      it('should return empty array when input is empty array', async () => {
        const result = await service.assignSystemIdsToKeyDefinitions([], 999);

        expect(result).toEqual([]);
        expect(mockIdGenerator.getNextId).not.toHaveBeenCalled();
      });

      it('should handle key definitions with no values', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef],
          999,
        );

        expect(result[0].systemId).toBe(1);
        expect(result[0].values).toHaveLength(0);
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(1);
      });

      it('should handle key definitions with multiple values', async () => {
        var values = [];
        // Add 5 values
        for (let i = 1; i <= 5; i++) {
          values.push(
            new ValueDefinition({
              systemId: 0,
              valueId: i * 10,
              name: `Value ${i}`,
              description: '',
              cHeaderEnumValue: String(i * 10),
            }),
          );
        }

        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
          values,
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const result = await service.assignSystemIdsToKeyDefinitions(
          [keyDef],
          999,
        );

        expect(result[0].values).toHaveLength(5);
        // 1 for key + 5 for values = 6 total
        expect(mockIdGenerator.getNextId).toHaveBeenCalledTimes(6);
      });
    });

    describe('ID Assignment', () => {
      it('should mutate input objects directly', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const inputArray = [keyDef];
        const result = await service.assignSystemIdsToKeyDefinitions(
          inputArray,
          999,
        );

        // Should mutate the original object
        expect(keyDef.systemId).toBe(1);
        expect(keyDef.fileSystemId).toBe(999);
        expect(result[0]).toBe(keyDef);
      });

      it('should return same array reference', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockResolvedValue(1);

        const inputArray = [keyDef];
        const result = await service.assignSystemIdsToKeyDefinitions(
          inputArray,
          999,
        );

        expect(result).toBe(inputArray);
      });
    });

    describe('Error Handling', () => {
      it('should propagate error when idGenerator.getNextId throws', async () => {
        const keyDef = new KeyDefinition({
          systemId: 0,
          keyId: 100,
          fileSystemId: 0,
          name: 'Test Key',
          description: '',
          isCalibrationKey: false,
          isGraphKey: true,
          isVoice: false,
          isDynamic: false,
          cHeaderAttributes: {
            keyEnumName: 'TEST_KEY',
            keyEnumValue: '100',
          },
        });

        mockIdGenerator.getNextId.mockRejectedValue(
          new Error('ID generation failed'),
        );

        await expect(
          service.assignSystemIdsToKeyDefinitions([keyDef], 999),
        ).rejects.toThrow('ID generation failed');
      });
    });
  });
});
