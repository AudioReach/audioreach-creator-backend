/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ForeignKeyMapper} from '../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {BulkKeyDefinitionInsertResult} from '../../../../../../src/application/ports/persistence/repositories/bulk-import/key-definition-insertion-report.js';

describe('ForeignKeyMapper', () => {
  let mapper: ForeignKeyMapper;

  beforeEach(() => {
    mapper = new ForeignKeyMapper();
  });

  describe('Key Definition Mappings', () => {
    it('should add single key definition mapping', () => {
      mapper.addKeyDefinitionMapping(100, 1);

      expect(mapper.getKeySystemId(100)).toBe(1);
    });

    it('should retrieve key systemId by keyId', () => {
      mapper.addKeyDefinitionMapping(100, 1);
      mapper.addKeyDefinitionMapping(200, 2);

      expect(mapper.getKeySystemId(100)).toBe(1);
      expect(mapper.getKeySystemId(200)).toBe(2);
    });

    it('should return undefined for non-existent keyId', () => {
      expect(mapper.getKeySystemId(999)).toBeUndefined();
    });

    it('should check if key mapping exists', () => {
      mapper.addKeyDefinitionMapping(100, 1);

      expect(mapper.hasKeyMapping(100)).toBe(true);
      expect(mapper.hasKeyMapping(999)).toBe(false);
    });

    it('should get all key mappings', () => {
      mapper.addKeyDefinitionMapping(100, 1);
      mapper.addKeyDefinitionMapping(200, 2);

      const allMappings = mapper.getAllKeyMappings();

      expect(allMappings.size).toBe(2);
      expect(allMappings.get(100)).toBe(1);
      expect(allMappings.get(200)).toBe(2);
    });

    it('should return a copy of key mappings, not the original', () => {
      mapper.addKeyDefinitionMapping(100, 1);

      const mappings1 = mapper.getAllKeyMappings();
      const mappings2 = mapper.getAllKeyMappings();

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1).toEqual(mappings2);
    });
  });

  describe('Value Definition Mappings', () => {
    beforeEach(() => {
      // Add parent key mapping first
      mapper.addKeyDefinitionMapping(100, 1);
    });

    it('should add single value definition mapping', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);

      expect(mapper.getValueSystemId(100, 10)).toBe(101);
    });

    it('should retrieve value systemId by keyId and valueId', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);
      mapper.addValueDefinitionMapping(100, 20, 102);

      expect(mapper.getValueSystemId(100, 10)).toBe(101);
      expect(mapper.getValueSystemId(100, 20)).toBe(102);
    });

    it('should return undefined for non-existent value', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);

      expect(mapper.getValueSystemId(100, 999)).toBeUndefined();
    });

    it('should return undefined when parent key does not exist', () => {
      expect(mapper.getValueSystemId(999, 10)).toBeUndefined();
    });

    it('should check if value mapping exists', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);

      expect(mapper.hasValueMapping(100, 10)).toBe(true);
      expect(mapper.hasValueMapping(100, 999)).toBe(false);
      expect(mapper.hasValueMapping(999, 10)).toBe(false);
    });

    it('should get value mappings for specific key', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);
      mapper.addValueDefinitionMapping(100, 20, 102);

      const valueMappings = mapper.getValueMappingsForKey(100);

      expect(valueMappings).toBeDefined();
      expect(valueMappings!.size).toBe(2);
      expect(valueMappings!.get(10)).toBe(101);
      expect(valueMappings!.get(20)).toBe(102);
    });

    it('should return undefined for value mappings when key does not exist', () => {
      expect(mapper.getValueMappingsForKey(999)).toBeUndefined();
    });

    it('should return a copy of value mappings, not the original', () => {
      mapper.addValueDefinitionMapping(100, 10, 101);

      const mappings1 = mapper.getValueMappingsForKey(100);
      const mappings2 = mapper.getValueMappingsForKey(100);

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1).toEqual(mappings2);
    });

    it('should handle multiple keys with their own value mappings', () => {
      mapper.addKeyDefinitionMapping(200, 2);

      mapper.addValueDefinitionMapping(100, 10, 101);
      mapper.addValueDefinitionMapping(100, 20, 102);
      mapper.addValueDefinitionMapping(200, 30, 201);
      mapper.addValueDefinitionMapping(200, 40, 202);

      expect(mapper.getValueSystemId(100, 10)).toBe(101);
      expect(mapper.getValueSystemId(100, 20)).toBe(102);
      expect(mapper.getValueSystemId(200, 30)).toBe(201);
      expect(mapper.getValueSystemId(200, 40)).toBe(202);
    });
  });

  describe('Bulk Key Definition Mappings', () => {
    it('should store mappings from BulkKeyDefinitionInsertResult', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 100,
              systemId: 1,
            },
            childMappings: {
              valueDefinitions: [
                {naturalId: 10, systemId: 101},
                {naturalId: 20, systemId: 102},
              ],
            },
            errors: [],
          },
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 200,
              systemId: 2,
            },
            childMappings: {
              valueDefinitions: [{naturalId: 30, systemId: 201}],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      expect(mapper.getKeySystemId(100)).toBe(1);
      expect(mapper.getKeySystemId(200)).toBe(2);
      expect(mapper.getValueSystemId(100, 10)).toBe(101);
      expect(mapper.getValueSystemId(100, 20)).toBe(102);
      expect(mapper.getValueSystemId(200, 30)).toBe(201);
    });

    it('should store both key and value mappings from result', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 100,
              systemId: 1,
            },
            childMappings: {
              valueDefinitions: [{naturalId: 10, systemId: 101}],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      const stats = mapper.getStats();
      expect(stats.keyMappings).toBe(1);
      expect(stats.valueMappings).toBe(1);
    });

    it('should handle results with no child mappings', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 100,
              systemId: 1,
            },
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      expect(mapper.getKeySystemId(100)).toBe(1);
      expect(mapper.getValueMappingsForKey(100)).toBeDefined();
    });

    it('should handle results with empty value definitions array', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 100,
              systemId: 1,
            },
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      expect(mapper.getKeySystemId(100)).toBe(1);
      const valueMappings = mapper.getValueMappingsForKey(100);
      expect(valueMappings).toBeDefined();
      expect(valueMappings!.size).toBe(0);
    });

    it('should skip failed insertions', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 100,
              systemId: 1,
            },
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
          {
            success: false,
            keyDefinitionIdMapping: undefined,
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
          {
            success: true,
            keyDefinitionIdMapping: {
              naturalId: 200,
              systemId: 2,
            },
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      expect(mapper.getKeySystemId(100)).toBe(1);
      expect(mapper.getKeySystemId(200)).toBe(2);
      expect(mapper.getStats().keyMappings).toBe(2);
    });

    it('should skip results without idMapping', () => {
      const bulkResult: BulkKeyDefinitionInsertResult = {
        results: [
          {
            success: true,
            keyDefinitionIdMapping: undefined,
            childMappings: {
              valueDefinitions: [],
            },
            errors: [],
          },
        ],
      };

      mapper.setKeyDefinitionMappings(bulkResult);

      expect(mapper.getStats().keyMappings).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should return correct stats for empty mapper', () => {
      const stats = mapper.getStats();

      expect(stats.keyMappings).toBe(0);
      expect(stats.valueMappings).toBe(0);
      expect(stats.subgraphMappings).toBe(0);
      expect(stats.containerMappings).toBe(0);
      expect(stats.moduleDefinitionMappings).toBe(0);
      expect(stats.spfModuleMappings).toBe(0);
      expect(stats.moduleInputPortMappings).toBe(0);
      expect(stats.moduleOutputPortMappings).toBe(0);
      expect(stats.moduleControlPortMappings).toBe(0);
      expect(stats.dataLinkMappings).toBe(0);
      expect(stats.controlLinkMappings).toBe(0);
    });

    it('should return correct stats after adding mappings', () => {
      mapper.addKeyDefinitionMapping(100, 1);
      mapper.addKeyDefinitionMapping(200, 2);
      mapper.addValueDefinitionMapping(100, 10, 101);

      const stats = mapper.getStats();

      expect(stats.keyMappings).toBe(2);
      expect(stats.valueMappings).toBe(1);
    });
  });

  describe('Clear', () => {
    it('should clear all mappings', () => {
      mapper.addKeyDefinitionMapping(100, 1);
      mapper.addKeyDefinitionMapping(200, 2);
      mapper.addValueDefinitionMapping(100, 10, 101);

      mapper.clear();

      expect(mapper.getKeySystemId(100)).toBeUndefined();
      expect(mapper.getKeySystemId(200)).toBeUndefined();
      expect(mapper.getValueSystemId(100, 10)).toBeUndefined();

      const stats = mapper.getStats();
      expect(stats.keyMappings).toBe(0);
      expect(stats.valueMappings).toBe(0);
    });
  });
});
