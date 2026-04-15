/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ForeignKeyMapper} from '../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../src/shared/types/branded-ids.js';

describe('ForeignKeyMapper', () => {
  let mapper: ForeignKeyMapper;

  beforeEach(() => {
    mapper = new ForeignKeyMapper();
  });

  describe('Key Definition Mappings', () => {
    it('should add single key definition mapping', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));

      expect(mapper.getKeySystemId(asNaturalId(100))).toBe(1);
    });

    it('should retrieve key systemId by keyId', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addKeyDefinitionMapping(asNaturalId(200), asSystemId(2));

      expect(mapper.getKeySystemId(asNaturalId(100))).toBe(1);
      expect(mapper.getKeySystemId(asNaturalId(200))).toBe(2);
    });

    it('should return undefined for non-existent keyId', () => {
      expect(mapper.getKeySystemId(asNaturalId(999))).toBeUndefined();
    });

    it('should check if key mapping exists', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));

      expect(mapper.hasKeyMapping(asNaturalId(100))).toBe(true);
      expect(mapper.hasKeyMapping(asNaturalId(999))).toBe(false);
    });

    it('should get all key mappings', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addKeyDefinitionMapping(asNaturalId(200), asSystemId(2));

      const allMappings = mapper.getAllKeyMappings();

      expect(allMappings.size).toBe(2);
      expect(allMappings.get(asNaturalId(100))).toBe(1);
      expect(allMappings.get(asNaturalId(200))).toBe(2);
    });

    it('should return a copy of key mappings, not the original', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));

      const mappings1 = mapper.getAllKeyMappings();
      const mappings2 = mapper.getAllKeyMappings();

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1).toEqual(mappings2);
    });
  });

  describe('Value Definition Mappings', () => {
    beforeEach(() => {
      // Add parent key mapping first
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
    });

    it('should add single value definition mapping', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(mapper.getValueSystemId(asNaturalId(100), asNaturalId(10))).toBe(
        101,
      );
    });

    it('should retrieve value systemId by keyId and valueId', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(20),
        asSystemId(102),
      );

      expect(mapper.getValueSystemId(asNaturalId(100), asNaturalId(10))).toBe(
        101,
      );
      expect(mapper.getValueSystemId(asNaturalId(100), asNaturalId(20))).toBe(
        102,
      );
    });

    it('should return undefined for non-existent value', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(
        mapper.getValueSystemId(asNaturalId(100), asNaturalId(999)),
      ).toBeUndefined();
    });

    it('should return undefined when parent key does not exist', () => {
      expect(
        mapper.getValueSystemId(asNaturalId(999), asNaturalId(10)),
      ).toBeUndefined();
    });

    it('should check if value mapping exists', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(mapper.hasValueMapping(asNaturalId(100), asNaturalId(10))).toBe(
        true,
      );
      expect(mapper.hasValueMapping(asNaturalId(100), asNaturalId(999))).toBe(
        false,
      );
      expect(mapper.hasValueMapping(asNaturalId(999), asNaturalId(10))).toBe(
        false,
      );
    });

    it('should get value mappings for specific key', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(20),
        asSystemId(102),
      );

      const valueMappings = mapper.getValueMappingsForKey(asNaturalId(100));

      expect(valueMappings).toBeDefined();
      expect(valueMappings!.size).toBe(2);
      expect(valueMappings!.get(asNaturalId(10))).toBe(101);
      expect(valueMappings!.get(asNaturalId(20))).toBe(102);
    });

    it('should return undefined for value mappings when key does not exist', () => {
      expect(mapper.getValueMappingsForKey(asNaturalId(999))).toBeUndefined();
    });

    it('should return a copy of value mappings, not the original', () => {
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      const mappings1 = mapper.getValueMappingsForKey(asNaturalId(100));
      const mappings2 = mapper.getValueMappingsForKey(asNaturalId(100));

      expect(mappings1).not.toBe(mappings2);
      expect(mappings1).toEqual(mappings2);
    });

    it('should handle multiple keys with their own value mappings', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(200), asSystemId(2));

      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(20),
        asSystemId(102),
      );
      mapper.addValueDefinitionMapping(
        asNaturalId(200),
        asNaturalId(30),
        asSystemId(201),
      );
      mapper.addValueDefinitionMapping(
        asNaturalId(200),
        asNaturalId(40),
        asSystemId(202),
      );

      expect(mapper.getValueSystemId(asNaturalId(100), asNaturalId(10))).toBe(
        101,
      );
      expect(mapper.getValueSystemId(asNaturalId(100), asNaturalId(20))).toBe(
        102,
      );
      expect(mapper.getValueSystemId(asNaturalId(200), asNaturalId(30))).toBe(
        201,
      );
      expect(mapper.getValueSystemId(asNaturalId(200), asNaturalId(40))).toBe(
        202,
      );
    });
  });

  describe('Module Definition Mappings', () => {
    it('should add single module definition mapping', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));

      expect(mapper.getModuleDefinitionSystemId(asNaturalId(100))).toBe(1);
    });

    it('should retrieve module definition systemId by moduleId', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));

      expect(mapper.getModuleDefinitionSystemId(asNaturalId(100))).toBe(1);
      expect(mapper.getModuleDefinitionSystemId(asNaturalId(200))).toBe(2);
    });

    it('should return undefined for non-existent moduleId', () => {
      expect(
        mapper.getModuleDefinitionSystemId(asNaturalId(999)),
      ).toBeUndefined();
    });

    it('should handle multiple module definition mappings', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));
      mapper.addModuleDefinitionMapping(asNaturalId(300), asSystemId(3));

      expect(mapper.getModuleDefinitionSystemId(asNaturalId(100))).toBe(1);
      expect(mapper.getModuleDefinitionSystemId(asNaturalId(200))).toBe(2);
      expect(mapper.getModuleDefinitionSystemId(asNaturalId(300))).toBe(3);
    });

    it('should throw error when adding duplicate module definition mapping', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));

      expect(() => {
        mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(999));
      }).toThrow('Module definition 100 already mapped to systemId 1');
    });
  });

  describe('Parameter Definition Mappings', () => {
    beforeEach(() => {
      // Add parent module definition mapping first
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));
    });

    it('should add single parameter definition mapping', () => {
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(10)),
      ).toBe(101);
    });

    it('should retrieve parameter systemId by moduleDefinitionId and paramId', () => {
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(20),
        asSystemId(102),
      );

      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(10)),
      ).toBe(101);
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(20)),
      ).toBe(102);
    });

    it('should return undefined for non-existent parameter', () => {
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(999)),
      ).toBeUndefined();
    });

    it('should return undefined when module definition does not exist', () => {
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(999), asNaturalId(10)),
      ).toBeUndefined();
    });

    it('should handle multiple module definitions with their own parameters', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));

      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(20),
        asSystemId(102),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(2),
        asNaturalId(30),
        asSystemId(201),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(2),
        asNaturalId(40),
        asSystemId(202),
      );

      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(10)),
      ).toBe(101);
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(20)),
      ).toBe(102);
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(2), asNaturalId(30)),
      ).toBe(201);
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(2), asNaturalId(40)),
      ).toBe(202);
    });

    it('should get all parameter systemIds for a module', () => {
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(20),
        asSystemId(102),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(30),
        asSystemId(103),
      );

      const paramSystemIds = mapper.getModuleParamSystemIds(asSystemId(1));

      expect(paramSystemIds).toHaveLength(3);
      expect(paramSystemIds).toContain(101);
      expect(paramSystemIds).toContain(102);
      expect(paramSystemIds).toContain(103);
    });

    it('should return empty array when module has no parameters', () => {
      const paramSystemIds = mapper.getModuleParamSystemIds(asSystemId(1));

      expect(paramSystemIds).toEqual([]);
    });

    it('should return empty array when module definition does not exist', () => {
      const paramSystemIds = mapper.getModuleParamSystemIds(asSystemId(999));

      expect(paramSystemIds).toEqual([]);
    });

    it('should throw error when adding duplicate parameter mapping', () => {
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );

      expect(() => {
        mapper.addParamDefinitionMapping(
          asSystemId(1),
          asNaturalId(10),
          asSystemId(999),
        );
      }).toThrow('Param 10 already mapped for module 1');
    });

    it('should handle parameters with same paramId across different modules', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));

      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(2),
        asNaturalId(10),
        asSystemId(201),
      );

      expect(
        mapper.getParamDefinitionSystemId(asSystemId(1), asNaturalId(10)),
      ).toBe(101);
      expect(
        mapper.getParamDefinitionSystemId(asSystemId(2), asNaturalId(10)),
      ).toBe(201);
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
      expect(stats.paramDefinitionMappingsByModuleId).toBe(0);
      expect(stats.spfModuleMappings).toBe(0);
      expect(stats.moduleInputPortMappings).toBe(0);
      expect(stats.moduleOutputPortMappings).toBe(0);
      expect(stats.moduleControlPortMappings).toBe(0);
      expect(stats.dataLinkMappings).toBe(0);
      expect(stats.controlLinkMappings).toBe(0);
    });

    it('should return correct stats after adding mappings', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addKeyDefinitionMapping(asNaturalId(200), asSystemId(2));
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      const stats = mapper.getStats();

      expect(stats.keyMappings).toBe(2);
      expect(stats.valueMappings).toBe(1);
    });

    it('should return correct stats after adding module definition mappings', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));
      mapper.addModuleDefinitionMapping(asNaturalId(300), asSystemId(3));

      const stats = mapper.getStats();

      expect(stats.moduleDefinitionMappings).toBe(3);
    });

    it('should return correct stats after adding parameter definition mappings', () => {
      mapper.addModuleDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));

      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(1),
        asNaturalId(20),
        asSystemId(102),
      );
      mapper.addParamDefinitionMapping(
        asSystemId(2),
        asNaturalId(30),
        asSystemId(201),
      );

      const stats = mapper.getStats();

      expect(stats.paramDefinitionMappingsByModuleId).toBe(2); // 2 modules with params
    });

    it('should return correct stats with mixed mapping types', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );
      mapper.addModuleDefinitionMapping(asNaturalId(200), asSystemId(2));
      mapper.addParamDefinitionMapping(
        asSystemId(2),
        asNaturalId(20),
        asSystemId(201),
      );

      const stats = mapper.getStats();

      expect(stats.keyMappings).toBe(1);
      expect(stats.valueMappings).toBe(1);
      expect(stats.moduleDefinitionMappings).toBe(1);
      expect(stats.paramDefinitionMappingsByModuleId).toBe(1);
    });
  });

  describe('Clear', () => {
    it('should clear all mappings', () => {
      mapper.addKeyDefinitionMapping(asNaturalId(100), asSystemId(1));
      mapper.addKeyDefinitionMapping(asNaturalId(200), asSystemId(2));
      mapper.addValueDefinitionMapping(
        asNaturalId(100),
        asNaturalId(10),
        asSystemId(101),
      );

      mapper.clear();

      expect(mapper.getKeySystemId(asNaturalId(100))).toBeUndefined();
      expect(mapper.getKeySystemId(asNaturalId(200))).toBeUndefined();
      expect(
        mapper.getValueSystemId(asNaturalId(100), asNaturalId(10)),
      ).toBeUndefined();

      const stats = mapper.getStats();
      expect(stats.keyMappings).toBe(0);
      expect(stats.valueMappings).toBe(0);
    });
  });

  describe('KeyVector Methods', () => {
    describe('addKeyVectorMapping', () => {
      it('should store KeyVector mapping', () => {
        const valueSystemIds = [100, 200, 300];
        const keyVectorSystemId = asSystemId(5000);

        mapper.addKeyVectorMapping(valueSystemIds, keyVectorSystemId);

        const retrieved = mapper.getKeyVectorSystemId(valueSystemIds);
        expect(retrieved).toBe(keyVectorSystemId);
      });

      it('should deduplicate KeyVectors with same value system IDs', () => {
        const valueSystemIds1 = [100, 200, 300];
        const valueSystemIds2 = [100, 200, 300]; // Same values
        const keyVectorSystemId = asSystemId(5000);

        mapper.addKeyVectorMapping(valueSystemIds1, keyVectorSystemId);

        const retrieved = mapper.getKeyVectorSystemId(valueSystemIds2);
        expect(retrieved).toBe(keyVectorSystemId);
      });

      it('should distinguish KeyVectors with different value system IDs', () => {
        const valueSystemIds1 = [100, 200, 300];
        const valueSystemIds2 = [100, 200, 400]; // Different last value
        const keyVectorSystemId1 = asSystemId(5000);
        const keyVectorSystemId2 = asSystemId(5001);

        mapper.addKeyVectorMapping(valueSystemIds1, keyVectorSystemId1);
        mapper.addKeyVectorMapping(valueSystemIds2, keyVectorSystemId2);

        expect(mapper.getKeyVectorSystemId(valueSystemIds1)).toBe(
          keyVectorSystemId1,
        );
        expect(mapper.getKeyVectorSystemId(valueSystemIds2)).toBe(
          keyVectorSystemId2,
        );
      });

      it('should handle empty value system IDs array', () => {
        const valueSystemIds: number[] = [];
        const keyVectorSystemId = asSystemId(5000);

        mapper.addKeyVectorMapping(valueSystemIds, keyVectorSystemId);

        const retrieved = mapper.getKeyVectorSystemId(valueSystemIds);
        expect(retrieved).toBe(keyVectorSystemId);
      });
    });

    describe('getKeyVectorSystemId', () => {
      it('should retrieve existing KeyVector systemId', () => {
        const valueSystemIds = [100, 200, 300];
        const keyVectorSystemId = asSystemId(5000);

        mapper.addKeyVectorMapping(valueSystemIds, keyVectorSystemId);

        const retrieved = mapper.getKeyVectorSystemId(valueSystemIds);
        expect(retrieved).toBe(keyVectorSystemId);
      });

      it('should return undefined for non-existent KeyVector', () => {
        const valueSystemIds = [100, 200, 300];

        const retrieved = mapper.getKeyVectorSystemId(valueSystemIds);
        expect(retrieved).toBeUndefined();
      });
    });

    describe('getKeyVectorCount', () => {
      it('should return zero for empty mapper', () => {
        expect(mapper.getKeyVectorCount()).toBe(0);
      });

      it('should return correct count of unique KeyVectors', () => {
        mapper.addKeyVectorMapping([100, 200], asSystemId(5000));
        mapper.addKeyVectorMapping([300, 400], asSystemId(5001));
        mapper.addKeyVectorMapping([500, 600], asSystemId(5002));

        expect(mapper.getKeyVectorCount()).toBe(3);
      });

      it('should not double-count duplicate KeyVectors', () => {
        const valueSystemIds1 = [100, 200, 300];
        const valueSystemIds2 = [100, 200, 300]; // Same values
        const keyVectorSystemId = asSystemId(5000);

        mapper.addKeyVectorMapping(valueSystemIds1, keyVectorSystemId);

        // Attempting to add the same KeyVector again should throw
        expect(() => {
          mapper.addKeyVectorMapping(valueSystemIds2, asSystemId(5001));
        }).toThrow('KeyVector with hash');

        // Count should still be 1
        expect(mapper.getKeyVectorCount()).toBe(1);
      });
    });
  });
});
