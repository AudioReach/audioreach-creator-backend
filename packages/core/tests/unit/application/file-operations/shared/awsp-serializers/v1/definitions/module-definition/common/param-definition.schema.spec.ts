/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspParamDefinitionSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.schema.js';

describe('AwspParamDefinitionSchema', () => {
  it('should parse valid param definition with all required fields', () => {
    const validData = {
      id: 1,
      name: 'test_param',
      toolPolicies: ['Calibration', 'Rtc'],
      pidType: 'Shared',
      elements: [{elementType: 'config', name: 'element1', value: 42}],
    };
    const result = AwspParamDefinitionSchema.parse(validData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test_param');
    expect(result.toolPolicies).toEqual(['Calibration', 'Rtc']);
    expect(result.pidType).toBe('Shared');
  });

  it('should parse param definition with optional fields', () => {
    const fullData = {
      id: 1,
      name: 'test_param',
      toolPolicies: ['Rtc'],
      pidType: 'None',
      elements: [],
      description: 'A test parameter',
      maxSize: 1024,
      isNeuralNet: true,
      isOffloaded: false,
      isHwAccel: true,
      isHwAccelEnable: false,
      isHidden: false,
      isReadOnly: true,
      deprecated: false,
    };
    const result = AwspParamDefinitionSchema.parse(fullData);
    expect(result.description).toBe('A test parameter');
    expect(result.maxSize).toBe(1024);
    expect(result.isNeuralNet).toBe(true);
    expect(result.isReadOnly).toBe(true);
  });

  it('should reject invalid param definition with wrong id type', () => {
    const invalidData = {
      id: '1',
      name: 'test_param',
      toolPolicies: ['Rtc'],
      pidType: 'None',
      elements: [],
    };
    expect(() => AwspParamDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid tool policy', () => {
    const invalidData = {
      id: 1,
      name: 'test_param',
      toolPolicies: ['InvalidPolicy'],
      pidType: 'None',
      elements: [],
    };
    expect(() => AwspParamDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should reject invalid PID type', () => {
    const invalidData = {
      id: 1,
      name: 'test_param',
      toolPolicies: ['Rtc'],
      pidType: 'InvalidType',
      elements: [],
    };
    expect(() => AwspParamDefinitionSchema.parse(invalidData)).toThrow();
  });
});
