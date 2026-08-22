/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspDriverModuleDefinitionSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.schema.js';

describe('AwspDriverModuleDefinitionSchema', () => {
  it('should parse valid driver module definition', () => {
    const validData = {
      id: 1,
      name: 'test_driver_module',
      parameters: [],
    };
    const result = AwspDriverModuleDefinitionSchema.parse(validData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test_driver_module');
  });

  it('should parse with optional fields', () => {
    const fullData = {
      id: 1,
      name: 'test_driver_module',
      parameters: [],
      displayName: 'Test Driver',
      description: 'A test driver module',
      stubbed: true,
      deprecated: false,
    };
    const result = AwspDriverModuleDefinitionSchema.parse(fullData);
    expect(result.displayName).toBe('Test Driver');
    expect(result.stubbed).toBe(true);
  });

  it('should reject invalid driver module definition', () => {
    const invalidData = {
      id: '1',
      name: 'test_driver_module',
      parameters: [],
    };
    expect(() => AwspDriverModuleDefinitionSchema.parse(invalidData)).toThrow();
  });

  it('should reject missing required fields', () => {
    const invalidData = {
      id: 1,
    };
    expect(() => AwspDriverModuleDefinitionSchema.parse(invalidData)).toThrow();
  });
});
