/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspParser} from '../../../../../../src/application/file-operations/upload-file/services/awsp-parser.js';
import {DEFINITION_BLOCK_NAMES} from '../../../../../../src/application/file-operations/shared/constants/definition-block-names.js';
import {AwspSpfModuleDefinition} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import {AwspKeyDefinition} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/key-definition.js';

describe('AwspParser', () => {
  describe('parse', () => {
    it('should return class instances for SPF module definitions', () => {
      const input = {
        definitionBlocks: {
          [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: [
            {
              id: 1,
              name: 'test-module',
              description: 'Test module',
              moduleId: 0x12345,
              processors: [1, 2],
              containerTypes: [1],
              parameters: [],
            },
          ],
        },
        taskName: 'test',
      };

      const result = AwspParser.parse(input);

      const spfModules = result[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS];
      expect(Array.isArray(spfModules)).toBe(true);
      expect(spfModules?.length).toBe(1);

      // Verify it's a class instance with methods
      expect(spfModules?.[0]).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(typeof spfModules?.[0]?.toJSON).toBe('function');

      // Verify data is correct
      expect(spfModules?.[0]?.id).toBe(1);
      expect(spfModules?.[0]?.name).toBe('test-module');
      expect(spfModules?.[0]?.processors).toEqual([1, 2]);
    });

    it('should return class instances for key definitions', () => {
      const input = {
        definitionBlocks: {
          [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: [
            {
              id: 1,
              name: 'test-key',
              description: 'Test key',
              keyId: 0x1000,
              values: [],
            },
          ],
        },
        taskName: 'test',
      };

      const result = AwspParser.parse(input);

      const keyDefs = result[DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS];
      expect(Array.isArray(keyDefs)).toBe(true);
      expect(keyDefs?.length).toBe(1);

      // Verify it's a class instance with methods
      expect(keyDefs?.[0]).toBeInstanceOf(AwspKeyDefinition);
      expect(typeof keyDefs?.[0]?.toJSON).toBe('function');

      // Verify data is correct
      expect(keyDefs?.[0]?.id).toBe(1);
      expect(keyDefs?.[0]?.name).toBe('test-key');
      expect(keyDefs?.[0]?.values).toEqual([]);
    });

    it('should throw error for unknown definition block name', () => {
      const input = {
        definitionBlocks: {
          unknownBlock: [{}],
        },
        taskName: 'test',
      };

      expect(() => AwspParser.parse(input)).toThrow(
        'Unknown definition block name: unknownBlock',
      );
    });
  });
});
