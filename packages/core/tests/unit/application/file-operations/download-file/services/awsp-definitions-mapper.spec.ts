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
} from '../../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';
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
        enumValue: 'KEY_ENUM_VALUE',
        calKeyEnumValue: 'CAL_ENUM',
        graphKeyEnumValue: 'GRAPH_ENUM',
        values: [],
      };

      const [result] = mapper.toAwspKeyDefinitions([model]);

      expect(result.description).toBe('A key');
      expect(result.isVoice).toBe(true);
      expect(result.isDynamic).toBe(false);
      expect(result.enumName).toBe('KEY_ENUM_NAME');
      expect(result.enumValue).toBe('KEY_ENUM_VALUE');
      expect(result.calKeyEnumValue).toBe('CAL_ENUM');
      expect(result.graphKeyEnumValue).toBe('GRAPH_ENUM');
    });

    it('should assign specialty string directly as SpecialKey', () => {
      const model: KeyDefinitionDownloadModel = {
        keyId: 300,
        name: 'Key300',
        isCalibrationKey: true,
        specialty: 'SampleRate',
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
            enumValue: 'VAL_ENUM',
            specialValue: 'SPECIAL',
          },
        ],
      };

      const [key] = mapper.toAwspKeyDefinitions([model]);
      const [val] = key.values;

      expect(val.id).toBe(4001);
      expect(val.name).toBe('Val4001');
      expect(val.description).toBe('a value');
      expect(val.enumValue).toBe('VAL_ENUM');
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
      expect(result.supportedKeys).toEqual([]);
    });

    it('should map all optional tag fields', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 600,
        name: 'TagY',
        description: 'A tag',
        isVoice: true,
        enumName: 'TAG_ENUM_NAME',
        enumValue: 'TAG_ENUM_VALUE',
        supportedKeys: [],
      };

      const [result] = mapper.toAwspTagDefinitions([model]);

      expect(result.description).toBe('A tag');
      expect(result.isVoice).toBe(true);
      expect(result.enumName).toBe('TAG_ENUM_NAME');
      expect(result.enumValue).toBe('TAG_ENUM_VALUE');
    });

    it('should map supportedKeys with id, name, and enumValue', () => {
      const model: TagDefinitionDownloadModel = {
        tagId: 700,
        name: 'TagZ',
        isVoice: false,
        supportedKeys: [
          {keyId: 100, keyName: 'KeyA', tagEnumValue: 'KEY_TAG_ENUM'},
          {keyId: 200, keyName: 'KeyB'},
        ],
      };

      const [result] = mapper.toAwspTagDefinitions([model]);

      expect(result.supportedKeys).toHaveLength(2);
      expect(result.supportedKeys![0].id).toBe(100);
      expect(result.supportedKeys![0].name).toBe('KeyA');
      expect(result.supportedKeys![0].enumValue).toBe('KEY_TAG_ENUM');
      expect(result.supportedKeys![1].id).toBe(200);
      expect(result.supportedKeys![1].name).toBe('KeyB');
      expect(result.supportedKeys![1].enumValue).toBeUndefined();
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
        supportedProcessorIds: [0xA1, 0xA2],
        supportedContainerTypes: [0xB1],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.id).toBe(0x100);
      expect(result.name).toBe('TestMod');
      expect(result.displayName).toBe('Test Module');
      expect(result.description).toBe('desc');
      expect(result.groupName).toBe('Group');
      expect(result.searchKeys).toBe('search');
      expect(result.stackSize).toBe(4096);
      expect(result.supportedProcessorIds).toEqual([0xA1, 0xA2]);
      expect(result.supportedContainerTypes).toEqual([0xB1]);
    });

    it('should parse elementsStructure JSON for parameters', () => {
      const elements = [{type: 'uint32', name: 'field1'}];
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x200,
        name: 'ModWithParams',
        stackSize: 0,
        params: [{
          paramId: 1,
          name: 'P1',
          maxSize: 64,
          pidType: 'Shared',
          elementsStructure: JSON.stringify(elements),
          isReadOnly: false,
          toolPolicies: JSON.stringify(['Calibration']),
        }],
        portGroups: [],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.paramDefinitions).toHaveLength(1);
      expect(result.paramDefinitions![0].id).toBe(1);
      expect(result.paramDefinitions![0].pidType).toBe('Shared');
      expect(result.paramDefinitions![0].elements).toEqual(elements);
      expect(result.paramDefinitions![0].toolPolicies).toEqual(['Calibration']);
      expect(result.paramDefinitions![0].isReadOnly).toBe(false);
    });

    it('should map input and output port groups', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x300,
        name: 'ModWithPorts',
        stackSize: 0,
        params: [],
        portGroups: [
          {maxPortCount: 4, portIoType: 'Input', ports: [{portId: 1, name: 'In0'}]},
          {maxPortCount: 2, portIoType: 'Output', ports: [{portId: 2, name: 'Out0'}]},
        ],
        staticControlPorts: [],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.inputPortsInfo).toBeDefined();
      expect(result.inputPortsInfo!.maxPortCount).toBe(4);
      expect(result.inputPortsInfo!.ports).toHaveLength(1);
      expect(result.inputPortsInfo!.ports[0].id).toBe(1);
      expect(result.outputPortsInfo).toBeDefined();
      expect(result.outputPortsInfo!.ports[0].id).toBe(2);
    });

    it('should map static control ports with supportedIntents', () => {
      const model: SpfModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0x400,
        name: 'ModWithCtrl',
        stackSize: 0,
        params: [],
        portGroups: [],
        staticControlPorts: [{
          portId: 10, portName: 'CtrlPort0',
          intents: [{intentId: 100, name: 'IntentA'}],
        }],
        dynamicIntents: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const [result] = mapper.toAwspSpfModuleDefinitions([model]);

      expect(result.controlPortsInfo).toBeDefined();
      expect(result.controlPortsInfo!.staticPorts).toHaveLength(1);
      expect(result.controlPortsInfo!.staticPorts![0].id).toBe(10);
      expect(result.controlPortsInfo!.staticPorts![0].supportedIntents).toHaveLength(1);
      expect(result.controlPortsInfo!.staticPorts![0].supportedIntents[0].id).toBe(100);
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

      expect(result.controlPortsInfo).toBeDefined();
      expect(result.controlPortsInfo!.dynamicIntents).toHaveLength(1);
      expect(result.controlPortsInfo!.dynamicIntents![0].id).toBe(200);
      expect(result.controlPortsInfo!.dynamicIntents![0].maxports).toBe(8);
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

      expect(result.controlPortsInfo).toBeUndefined();
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
        moduleDefinitionId: 0xD100,
        name: 'DriverMod',
        description: 'A driver',
        groupName: 'DriverGroup',
        params: [],
      };

      const [result] = mapper.toDriverModuleDefinitions([model]);

      expect(result.id).toBe(0xD100);
      expect(result.name).toBe('DriverMod');
      expect(result.description).toBe('A driver');
      expect(result.paramDefinitions).toEqual([]);
    });

    it('should parse paramStructure JSON for parameters and use default toolPolicies/pidType', () => {
      const elements = [{type: 'uint16'}];
      const model: DriverModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0xD200,
        name: 'DriverWithParams',
        params: [{
          parameterId: 1,
          name: 'DP1',
          maxSize: 16,
          paramStructure: JSON.stringify(elements),
        }],
      };

      const [result] = mapper.toDriverModuleDefinitions([model]);

      expect(result.paramDefinitions).toHaveLength(1);
      expect(result.paramDefinitions![0].id).toBe(1);
      expect(result.paramDefinitions![0].elements).toEqual(elements);
      expect(result.paramDefinitions![0].toolPolicies).toEqual([]);
      expect(result.paramDefinitions![0].pidType).toBe('None');
    });

    it('should produce toJSON output that passes AwspDriverModuleDefinitionSchema validation', () => {
      const model: DriverModuleDefinitionDownloadModel = {
        moduleDefinitionId: 0xD300,
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
