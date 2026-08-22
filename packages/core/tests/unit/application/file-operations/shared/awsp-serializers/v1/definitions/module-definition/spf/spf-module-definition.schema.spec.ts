/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspSpfModuleDefinitionSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.schema.js';

describe('AwspSpfModuleDefinitionSchema', () => {
  it('should parse valid SPF module definition with required fields', () => {
    const validData = {
      id: 1,
      name: 'test_spf_module',
      parameters: [],
      processors: [2],
      containerTypes: [1],
    };
    const result = AwspSpfModuleDefinitionSchema.parse(validData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test_spf_module');
    expect(result.processors).toEqual([2]);
    expect(result.containerTypes).toEqual([1]);
  });

  it('should parse with all optional fields', () => {
    const fullData = {
      id: 1,
      name: 'test_spf_module',
      parameters: [],
      processors: [2],
      containerTypes: [1],
      displayName: 'Test SPF Module',
      description: 'A test SPF module',
      inputPort: {
        maxPortCount: 2,
        ports: [{id: 1, name: 'input1'}],
      },
      outputPort: {
        maxPortCount: 2,
        ports: [{id: 2, name: 'output1'}],
      },
      controlPort: {
        staticPorts: [],
        dynamicIntents: [],
      },
      stackSize: 4096,
      vocoderModuleType: 'NB',
      directionType: 'SOURCE',
      mdfModuleType: 'GENERIC',
      searchKeys: 'audio,processing',
      isOffloadable: true,
      builtIn: false,
      majorModuleType: 'AUDIO_PROCESSING',
      buildType: 'RELEASE',
      islandFriendly: true,
      customModule: {
        majorTypeID: 1,
        interfaceTypeID: 2,
        interfaceVersionID: 3,
        fileName: 'module.so',
        entryPointTag: 'entry',
      },
      groupName: 'Audio',
      rtmLogCode: 'LOG001',
      hasNeuralNetParam: false,
    };
    const result = AwspSpfModuleDefinitionSchema.parse(fullData);
    expect(result.stackSize).toBe(4096);
    expect(result.isOffloadable).toBe(true);
    expect(result.groupName).toBe('Audio');
  });

  it('should reject invalid SPF module definition', () => {
    const invalidData = {
      id: 1,
      name: 'test_spf_module',
      parameters: [],
      processors: 'invalid',
      containerTypes: [1],
    };
    expect(() => AwspSpfModuleDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should reject missing required fields', () => {
    const invalidData = {
      name: 'test_spf_module',
    };
    expect(() => AwspSpfModuleDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should accept minimal valid data with only required fields', () => {
    const minimalData = {
      id: 1,
      name: 'test_spf_module',
    };
    const result = AwspSpfModuleDefinitionSchema.parse(minimalData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test_spf_module');
  });
});
