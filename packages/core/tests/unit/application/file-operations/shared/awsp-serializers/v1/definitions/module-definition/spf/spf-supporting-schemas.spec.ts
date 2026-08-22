/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspPortSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/port.schema.js';
import {AwspStaticControlPortSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/static-control-port.schema.js';
import {AwspIntentSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/intent.schema.js';
import {AwspDataPortsInfoSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.schema.js';
import {AwspControlPortsInfoSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.schema.js';
import {AwspCustomModuleInfoSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/custom-module-info.schema.js';

describe('SPF Supporting Schemas', () => {
  describe('AwspPortSchema', () => {
    it('should parse valid port', () => {
      const validData = {
        id: 1,
        name: 'input_port',
      };
      const result = AwspPortSchema.parse(validData);
      expect(result.id).toBe(1);
      expect(result.name).toBe('input_port');
    });

    it('should parse port without name', () => {
      const validData = {
        id: 1,
      };
      const result = AwspPortSchema.parse(validData);
      expect(result.id).toBe(1);
      expect(result.name).toBeUndefined();
    });

    it('should reject invalid port', () => {
      const invalidData = {
        id: '1',
      };
      expect(() => AwspPortSchema.parse(invalidData)).toThrow();
    });
  });

  describe('AwspStaticControlPortSchema', () => {
    it('should parse valid static control port', () => {
      const validData = {
        id: 1,
        name: 'control_port',
        intents: [{id: 1, name: 'intent1', maxports: 2}],
      };
      const result = AwspStaticControlPortSchema.parse(validData);
      expect(result.id).toBe(1);
      expect(result.intents).toHaveLength(1);
    });
  });

  describe('AwspIntentSchema', () => {
    it('should parse valid intent', () => {
      const validData = {
        id: 1,
        name: 'test_intent',
        maxports: 4,
      };
      const result = AwspIntentSchema.parse(validData);
      expect(result.id).toBe(1);
      expect(result.maxports).toBe(4);
    });

    it('should parse intent without name', () => {
      const validData = {
        id: 1,
        maxports: 2,
      };
      const result = AwspIntentSchema.parse(validData);
      expect(result.name).toBeUndefined();
    });
  });

  describe('AwspDataPortsInfoSchema', () => {
    it('should parse valid data ports info', () => {
      const validData = {
        maxPortCount: 4,
        ports: [
          {id: 1, name: 'port1'},
          {id: 2, name: 'port2'},
        ],
      };
      const result = AwspDataPortsInfoSchema.parse(validData);
      expect(result.maxPortCount).toBe(4);
      expect(result.ports).toHaveLength(2);
    });
  });

  describe('AwspControlPortsInfoSchema', () => {
    it('should parse valid control ports info', () => {
      const validData = {
        staticPorts: [
          {
            id: 1,
            intents: [{id: 1, maxports: 2}],
          },
        ],
        dynamicIntents: [{id: 2, maxports: 4}],
      };
      const result = AwspControlPortsInfoSchema.parse(validData);
      expect(result.staticPorts).toHaveLength(1);
      expect(result.dynamicIntents).toHaveLength(1);
    });

    it('should parse with optional fields omitted', () => {
      const validData = {};
      const result = AwspControlPortsInfoSchema.parse(validData);
      expect(result.staticPorts).toBeUndefined();
      expect(result.dynamicIntents).toBeUndefined();
    });
  });

  describe('AwspCustomModuleInfoSchema', () => {
    it('should parse valid custom module info', () => {
      const validData = {
        majorTypeID: 1,
        interfaceTypeID: 2,
        interfaceVersionID: 3,
        fileName: 'module.so',
        entryPointTag: 'entry_point',
      };
      const result = AwspCustomModuleInfoSchema.parse(validData);
      expect(result.majorTypeID).toBe(1);
      expect(result.fileName).toBe('module.so');
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        majorTypeID: 1,
      };
      expect(() => AwspCustomModuleInfoSchema.parse(invalidData)).toThrow();
    });
  });
});
