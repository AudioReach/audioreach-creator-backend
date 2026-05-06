/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {BaseModuleDefinitionSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/common/base-module-definition.schema.js';

describe('BaseModuleDefinitionSchema', () => {
  it('should parse valid base module definition', () => {
    const validData = {
      id: 1,
      name: 'test_module',
      paramDefinitions: [
        {
          id: 1,
          name: 'param1',
          toolPolicies: ['Rtc'],
          pidType: 'None',
          elements: [],
        },
      ],
    };
    const result = BaseModuleDefinitionSchema.parse(validData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test_module');
    expect(result.paramDefinitions).toHaveLength(1);
  });

  it('should parse with optional fields', () => {
    const fullData = {
      id: 1,
      name: 'test_module',
      paramDefinitions: [],
      displayName: 'Test Module',
      description: 'A test module',
      replacedBy: 2,
      deprecated: true,
    };
    const result = BaseModuleDefinitionSchema.parse(fullData);
    expect(result.displayName).toBe('Test Module');
    expect(result.description).toBe('A test module');
    expect(result.replacedBy).toBe(2);
    expect(result.deprecated).toBe(true);
  });

  it('should reject invalid base module definition with wrong id type', () => {
    const invalidData = {
      id: '1',
      name: 'test_module',
      paramDefinitions: [],
    };
    expect(() => BaseModuleDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should reject missing required fields', () => {
    const invalidData = {
      id: 1,
    };
    expect(() => BaseModuleDefinitionSchema.parse(invalidData)).toThrow();
  });
});
