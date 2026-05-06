/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspParamDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';

describe('AwspParamDefinition serialization', () => {
  describe('fromJSON', () => {
    it('should parse valid JSON data with required fields', () => {
      const json = {
        id: 1,
        name: 'TestParam',
        toolPolicies: ['Calibration'],
        pidType: 'None',
        elements: [],
      };

      const param = AwspParamDefinition.fromJSON(json);

      expect(param).toBeInstanceOf(AwspParamDefinition);
      expect(param.id).toBe(1);
      expect(param.name).toBe('TestParam');
      expect(param.toolPolicies).toEqual(['Calibration']);
      expect(param.pidType).toBe('None');
      expect(param.elements).toEqual([]);
    });

    it('should handle optional fields', () => {
      const json = {
        id: 1,
        name: 'TestParam',
        toolPolicies: ['Calibration'],
        pidType: 'Shared',
        elements: [],
        description: 'Test description',
        maxSize: 100,
        isNeuralNet: true,
        isOffloaded: false,
        isHwAccel: true,
        isHwAccelEnable: false,
        isHidden: true,
        isReadOnly: false,
        deprecated: true,
      };

      const param = AwspParamDefinition.fromJSON(json);

      expect(param.description).toBe('Test description');
      expect(param.maxSize).toBe(100);
      expect(param.isNeuralNet).toBe(true);
      expect(param.isOffloaded).toBe(false);
      expect(param.isHwAccel).toBe(true);
      expect(param.isHwAccelEnable).toBe(false);
      expect(param.isHidden).toBe(true);
      expect(param.isReadOnly).toBe(false);
      expect(param.deprecated).toBe(true);
    });

    it('should throw on invalid data', () => {
      const invalidJson = {
        id: -1,
        name: 'TestParam',
      };

      expect(() => AwspParamDefinition.fromJSON(invalidJson)).toThrow();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON with required fields', () => {
      const param = new AwspParamDefinition();
      param.id = 1;
      param.name = 'TestParam';
      param.toolPolicies = ['Calibration'];
      param.pidType = 'None';
      param.elements = [];

      const json = param.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestParam');
      expect(json.toolPolicies).toEqual(['Calibration']);
      expect(json.pidType).toBe('None');
      expect(json.elements).toEqual([]);
    });

    it('should include optional fields when present', () => {
      const param = new AwspParamDefinition();
      param.id = 1;
      param.name = 'TestParam';
      param.toolPolicies = ['RTC'];
      param.pidType = 'Shared';
      param.elements = [];
      param.description = 'Test';
      param.maxSize = 100;
      param.isNeuralNet = true;

      const json = param.toJSON();

      expect(json.description).toBe('Test');
      expect(json.maxSize).toBe(100);
      expect(json.isNeuralNet).toBe(true);
    });

    it('should omit undefined optional fields', () => {
      const param = new AwspParamDefinition();
      param.id = 1;
      param.name = 'TestParam';
      param.toolPolicies = ['Calibration'];
      param.pidType = 'None';
      param.elements = [];

      const json = param.toJSON();

      expect(json.description).toBeUndefined();
      expect(json.maxSize).toBeUndefined();
      expect(json.isNeuralNet).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestParam',
        toolPolicies: ['Calibration', 'Rtc'],
        pidType: 'GlobalShared',
        elements: [],
        description: 'Test description',
        maxSize: 100,
        isNeuralNet: true,
        isOffloaded: false,
        isHwAccel: true,
        isHwAccelEnable: false,
        isHidden: true,
        isReadOnly: false,
        deprecated: true,
      };

      const param = AwspParamDefinition.fromJSON(original);
      const serialized = param.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
