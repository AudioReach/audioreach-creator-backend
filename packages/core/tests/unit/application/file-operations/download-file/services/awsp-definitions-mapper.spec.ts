/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspDefinitionsMapper} from '../../../../../../src/application/file-operations/download-file/services/awsp-definitions-mapper.js';
import type {
  KeyDefinitionDownloadModel,
  TagDefinitionDownloadModel,
  SpfModuleDefinitionDownloadModel,
  DriverModuleDefinitionDownloadModel,
  SpfPropertyDefinitionDownloadModel,
  DriverPropertyDefinitionDownloadModel,
} from '../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {KeyDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/key-definition.schema.js';
import {TagDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.schema.js';
import {AwspSpfModuleDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.schema.js';
import {AwspDriverModuleDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.schema.js';
import {SpfPropertyDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.schema.js';
import {DriverPropertyDefinitionSchema} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/driver-property-definition.schema.js';

describe('AwspDefinitionsMapper', () => {
  const mapper = new AwspDefinitionsMapper();

  describe('toAwspKeyDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toAwspKeyDefinitions([])).toEqual([]);
    });

    it('should map all required fields', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 100,
        name: 'Key100',
        isCalibrationKey: true,
        isGraphKey: false,
        values: [{valueId: 1001, name: 'Val1001'}],
      };

      const result = mapper.toAwspKeyDefinitions([model]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(100);
      expect(result[0].name).toBe('Key100');
      expect(result[0].isCalKey).toBe(true);
      expect(result[0].isGraphKey).toBe(false);
      expect(result[0].values).toHaveLength(1);
      expect(result[0].values[0].id).toBe(1001);
      expect(result[0].values[0].name).toBe('Val1001');
    });

    it('should map all optional key fields', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 200,
        name: 'Key200',
        description: 'A key',
        isVoice: true,
        isDynamic: false,
        isCalibrationKey: true,
        isGraphKey: false,
        enumName: 'KEY_ENUM_NAME',
        enumMember: 'KEY_ENUM_VALUE',
        calKeyEnumMember: 'CAL_ENUM',
        graphKeyEnumMember: 'GRAPH_ENUM',
        values: [],
      };

      const [result] = mapper.toAwspKeyDefinitions([model]);

      expect(result.description).toBe('A key');
      expect(result.isVoice).toBe(true);
      expect(result.isDynamic).toBe(false);
      expect(result.enumName).toBe('KEY_ENUM_NAME');
      expect(result.enumMember).toBe('KEY_ENUM_VALUE');
      expect(result.calKeyEnumMember).toBe('CAL_ENUM');
      expect(result.graphKeyEnumMember).toBe('GRAPH_ENUM');
    });

    it('should assign specialty SpecialKey via specialityKeyValue JSON', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 300,
        name: 'Key300',
        isCalibrationKey: true,
        specialityKeyValue: JSON.stringify({key: 'SAMPLE_RATE', value: ''}),
        values: [],
      };

      const [result] = mapper.toAwspKeyDefinitions([model]);

      expect(result.specialty).toBe('SampleRate');
    });

    it('should leave specialty undefined when not provided', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 350,
        name: 'Key350',
        isCalibrationKey: true,
        values: [],
      };

      const [result] = mapper.toAwspKeyDefinitions([model]);

      expect(result.specialty).toBeUndefined();
    });

    it('should map all value fields including optional ones', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 400,
        name: 'Key400',
        isCalibrationKey: true,
        values: [
          {
            valueId: 4001,
            name: 'Val4001',
            description: 'a value',
            enumMember: 'VAL_ENUM',
            specialValue: 'SPECIAL',
          },
        ],
      };

      const [key] = mapper.toAwspKeyDefinitions([model]);
      const [val] = key.values;

      expect(val.id).toBe(4001);
      expect(val.name).toBe('Val4001');
      expect(val.description).toBe('a value');
      expect(val.enumMember).toBe('VAL_ENUM');
      expect(val.specialValue).toBe('SPECIAL');
    });

    it('should produce toJSON output that passes KeyDefinitionSchema validation', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 500,
        name: 'Key500',
        isCalibrationKey: true,
        isGraphKey: false,
        values: [{valueId: 5001, name: 'Val5001'}],
      };

      const [awspKey] = mapper.toAwspKeyDefinitions([model]);
      const json = awspKey.toJSON();

      expect(() => KeyDefinitionSchema.parse(json)).not.toThrow();
    });
  });

  describe('toAwspTagDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toAwspTagDefinitions([])).toEqual([]);
    });

    it('should map all required tag fields', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 500,
        name: 'TagX',
        isVoice: false,
        supportedKeys: [],
      };

      const [result] = mapper.toAwspTagDefinitions([model]);

      expect(result.id).toBe(500);
      expect(result.name).toBe('TagX');
      expect(result.isVoice).toBe(false);
      expect(result.keys).toEqual([]);
    });

    it('should map all optional tag fields', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 600,
        name: 'TagY',
        description: 'A tag',
        isVoice: true,
        enumName: 'TAG_ENUM_NAME',
        enumMember: 'TAG_ENUM_VALUE',
        supportedKeys: [],
      };

      const [result] = mapper.toAwspTagDefinitions([model]);

      expect(result.description).toBe('A tag');
      expect(result.isVoice).toBe(true);
      expect(result.enumName).toBe('TAG_ENUM_NAME');
      expect(result.enumMember).toBe('TAG_ENUM_VALUE');
    });

    it('should map supportedKeys with id, name, and enumMember', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 700,
        name: 'TagZ',
        isVoice: false,
        supportedKeys: [
          {keyId: 100, keyName: 'KeyA', enumValue: 'KEY_TAG_ENUM'},
          {keyId: 200, keyName: 'KeyB'},
        ],
      };

      const [result] = mapper.toAwspTagDefinitions([model]);

      expect(result.keys).toHaveLength(2);
      expect(result.keys![0].id).toBe(100);
      expect(result.keys![0].name).toBe('KeyA');
      expect(result.keys![0].enumMember).toBe('KEY_TAG_ENUM');
      expect(result.keys![1].id).toBe(200);
      expect(result.keys![1].name).toBe('KeyB');
      expect(result.keys![1].enumMember).toBeUndefined();
    });

    it('should produce toJSON output that passes TagDefinitionSchema validation', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 800,
        name: 'TagW',
        isVoice: true,
        supportedKeys: [{keyId: 100, keyName: 'KeyA'}],
      };

      const [awspTag] = mapper.toAwspTagDefinitions([model]);
      const json = awspTag.toJSON();

      expect(() => TagDefinitionSchema.parse(json)).not.toThrow();
    });
  });

  describe('toAwspSpfModuleDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toAwspSpfModuleDefinitions([])).toEqual([]);
    });

    it('should map all basic fields', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x100,
        name: 'TestMod',
        displayName: 'Test Module',
        description: 'desc',
        groupName: 'Group',
        searchKeys: 'search',
        stackSize: 4096,
        params: [],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [0xa1, 0xa2],
        supportedContainerTypes: [0xb1],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.id).toBe(0x100);
      expect(result.name).toBe('TestMod');
      expect(result.displayName).toBe('Test Module');
      expect(result.description).toBe('desc');
      expect(result.groupName).toBe('Group');
      expect(result.searchKeys).toBe('search');
      expect(result.stackSize).toBe(4096);
      expect(result.processors).toEqual([0xa1, 0xa2]);
      expect(result.containerTypes).toEqual([0xb1]);
    });

    it('should parse elementsStructure JSON for parameters', () => {
      const elements = [{type: 'uint32', name: 'field1'}];
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x200,
        name: 'ModWithParams',
        stackSize: 0,
        params: [
          {
            paramId: 1,
            name: 'P1',
            maxSize: 64,
            pidType: 'SHARED',
            elementsStructure: JSON.stringify(elements),
            isReadOnly: false,
            toolPolicies: JSON.stringify(['CALIBRATION']),
          },
        ],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.parameters).toHaveLength(1);
      expect(result.parameters![0].id).toBe(1);
      expect(result.parameters![0].pidType).toBe('Shared');
      expect(result.parameters![0].elements).toEqual(elements);
      expect(result.parameters![0].toolPolicies).toEqual(['Calibration']);
      expect(result.parameters![0].isReadOnly).toBe(false);
    });

    it('should map input and output port groups', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x300,
        name: 'ModWithPorts',
        stackSize: 0,
        params: [],
        portGroups: [
          {
            maxPortCount: 4,
            portIoType: 'Input',
            ports: [{portId: 1, name: 'In0'}],
          },
          {
            maxPortCount: 2,
            portIoType: 'Output',
            ports: [{portId: 2, name: 'Out0'}],
          },
        ],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.inputPort).toBeDefined();
      expect(result.inputPort!.maxPortCount).toBe(4);
      expect(result.inputPort!.ports).toHaveLength(1);
      expect(result.inputPort!.ports[0].id).toBe(1);
      expect(result.outputPort).toBeDefined();
      expect(result.outputPort!.ports[0].id).toBe(2);
    });

    it('should map static control ports with intents', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x400,
        name: 'ModWithCtrl',
        stackSize: 0,
        params: [],
        portGroups: [],
        staticControlPorts: [
          {
            portId: 10,
            portName: 'CtrlPort0',
            intents: [{intentId: 100, name: 'IntentA'}],
          },
        ],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.controlPort).toBeDefined();
      expect(result.controlPort!.staticPorts).toHaveLength(1);
      expect(result.controlPort!.staticPorts![0].id).toBe(10);
      expect(result.controlPort!.staticPorts![0].intents).toHaveLength(1);
      expect(result.controlPort!.staticPorts![0].intents[0].id).toBe(100);
    });

    it('should map dynamic intents with maxports', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x500,
        name: 'ModWithDynIntents',
        stackSize: 0,
        params: [],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [{intentId: 200, name: 'DynIntent0', maxPort: 8}],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.controlPort).toBeDefined();
      expect(result.controlPort!.dynamicIntents).toHaveLength(1);
      expect(result.controlPort!.dynamicIntents![0].id).toBe(200);
      expect(result.controlPort!.dynamicIntents![0].maxports).toBe(8);
    });

    it('should not set controlPortsInfo when no static ports or dynamic intents', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x600,
        name: 'SimpleModule',
        stackSize: 0,
        params: [],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.controlPort).toBeUndefined();
    });

    it('should produce toJSON output that passes AwspSpfModuleDefinitionSchema validation', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x700,
        name: 'ValidMod',
        stackSize: 0,
        params: [],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [awspMod] = mapper.toAwspSpfModuleDefinitions([model]);
      const json = awspMod.toJSON();

      expect(() => AwspSpfModuleDefinitionSchema.parse(json)).not.toThrow();
    });
  });

  describe('toDriverModuleDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toDriverModuleDefinitions([])).toEqual([]);
    });

    it('should map all basic fields', () => {
      const model: DriverModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0xd100,
        name: 'DriverMod',
        description: 'A driver',
        groupName: 'DriverGroup',
        params: [],
      };

      const [result] = mapper.toDriverModuleDefinitions([model]);

      expect(result.id).toBe(0xd100);
      expect(result.name).toBe('DriverMod');
      expect(result.description).toBe('A driver');
      expect(result.parameters).toEqual([]);
    });

    it('should parse paramStructure JSON for parameters and use default toolPolicies/pidType', () => {
      const elements = [{type: 'uint16'}];
      const model: DriverModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0xd200,
        name: 'DriverWithParams',
        params: [
          {
            parameterId: 1,
            name: 'DP1',
            maxSize: 16,
            paramStructure: JSON.stringify(elements),
          },
        ],
      };

      const [result] = mapper.toDriverModuleDefinitions([model]);

      expect(result.parameters).toHaveLength(1);
      expect(result.parameters![0].id).toBe(1);
      expect(result.parameters![0].elements).toEqual(elements);
      expect(result.parameters![0].toolPolicies).toEqual([]);
      expect(result.parameters![0].pidType).toBe('None');
    });

    it('should produce toJSON output that passes AwspDriverModuleDefinitionSchema validation', () => {
      const model: DriverModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0xd300,
        name: 'ValidDriver',
        params: [],
      };

      const [awspMod] = mapper.toDriverModuleDefinitions([model]);
      const json = awspMod.toJSON();

      expect(() => AwspDriverModuleDefinitionSchema.parse(json)).not.toThrow();
    });
  });

  describe('toSpfPropertyDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toSpfPropertyDefinitions([])).toEqual([]);
    });

    it('should map SG_CFG property with isVoice', () => {
      const elements = [{type: 'uint32'}];
      const model: SpfPropertyDefinitionDownloadModel = {
        propertyId: 1001,
        name: 'SgProp',
        description: 'subgraph prop',
        maxSize: 32,
        elementsStructure: JSON.stringify(elements),
        categoryName: 'SG_CFG',
        isVoice: true,
      };

      const [result] = mapper.toSpfPropertyDefinitions([model]);

      expect(result.id).toBe(1001);
      expect(result.name).toBe('SgProp');
      expect(result.description).toBe('subgraph prop');
      expect(result.maxSize).toBe(32);
      expect(result.elements).toEqual(elements);
      expect(result.categoryName).toBe('SG_CFG');
      expect(result.isVoice).toBe(true);
      expect(result.categoryId).toBe(1);
      expect(result.apmModuleInstanceId).toBe(1);
    });

    it('should map CONTAINTER_CFG property', () => {
      const model: SpfPropertyDefinitionDownloadModel = {
        propertyId: 2001,
        name: 'ContProp',
        maxSize: 64,
        elementsStructure: '[]',
        categoryName: 'CONTAINTER_CFG',
      };

      const [result] = mapper.toSpfPropertyDefinitions([model]);

      expect(result.categoryName).toBe('CONTAINTER_CFG');
      expect(result.isVoice).toBeUndefined();
    });

    it('should produce toJSON output that passes SpfPropertyDefinitionSchema validation', () => {
      const model: SpfPropertyDefinitionDownloadModel = {
        propertyId: 1001,
        name: 'Prop',
        maxSize: 4,
        elementsStructure: '[]',
        categoryName: 'SG_CFG',
      };

      const [awspProp] = mapper.toSpfPropertyDefinitions([model]);
      const json = awspProp.toJSON();

      expect(() => SpfPropertyDefinitionSchema.parse(json)).not.toThrow();
    });
  });

  describe('toDriverPropertyDefinitions', () => {
    it('should return empty array for empty input', () => {
      expect(mapper.toDriverPropertyDefinitions([])).toEqual([]);
    });

    it('should map all fields', () => {
      const elements = [{type: 'uint8', count: 128}];
      const model: DriverPropertyDefinitionDownloadModel = {
        propertyId: 3001,
        name: 'ModProp',
        description: 'module property',
        maxSize: 128,
        propertyStructure: JSON.stringify(elements),
      };

      const [result] = mapper.toDriverPropertyDefinitions([model]);

      expect(result.id).toBe(3001);
      expect(result.name).toBe('ModProp');
      expect(result.description).toBe('module property');
      expect(result.maxSize).toBe(128);
      expect(result.elements).toEqual(elements);
    });

    it('should produce toJSON output that passes DriverPropertyDefinitionSchema validation', () => {
      const model: DriverPropertyDefinitionDownloadModel = {
        propertyId: 3001,
        name: 'ValidProp',
        maxSize: 4,
        propertyStructure: '[]',
      };

      const [awspProp] = mapper.toDriverPropertyDefinitions([model]);
      const json = awspProp.toJSON();

      expect(() => DriverPropertyDefinitionSchema.parse(json)).not.toThrow();
    });
  });
});
