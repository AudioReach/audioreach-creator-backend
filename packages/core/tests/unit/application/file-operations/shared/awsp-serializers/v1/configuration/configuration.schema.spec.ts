/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  ProcessorConfigSchema,
  RtcConfigSchema,
  AlsaGroupSchema,
  AlsaLibConfigSchema,
  ConfigurationDataSchema,
  ConfigurationSchema,
} from '../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.schema.js';

const VALID_CONFIGURATION = {
  portStrategy: {strategy: 'SEQUENTIAL'},
  defaultProcessorDomain: {id: '0x2'},
  rtc: {
    processors: [
      {
        name: 'ADSP',
        id: '0x2',
        pidSize: 8192,
        rtcSize: 2097152,
        isEnabled: true,
      },
    ],
  },
  alsaLib: {
    includeTlvHeader: true,
    fileType: 'BIN',
    groups: [
      {
        id: 1,
        name: 'Group 1',
        properties: [{id: 1}, {id: 4}],
      },
    ],
  },
};

describe('Configuration Schemas', () => {
  describe('ProcessorConfigSchema', () => {
    it('should parse a processor with a hex id string', () => {
      const result = ProcessorConfigSchema.parse({
        name: 'ADSP',
        id: '0x2',
        pidSize: 8192,
        rtcSize: 2097152,
        isEnabled: true,
      });
      expect(result.id).toBe(2);
    });

    it('should reject a processor missing required fields', () => {
      expect(() =>
        ProcessorConfigSchema.parse({name: 'ADSP', id: '0x2'}),
      ).toThrow();
    });
  });

  describe('RtcConfigSchema', () => {
    it('should parse a list of processors', () => {
      const result = RtcConfigSchema.parse({
        processors: [
          {
            name: 'ADSP',
            id: '0x2',
            pidSize: 8192,
            rtcSize: 2097152,
            isEnabled: false,
          },
        ],
      });
      expect(result.processors).toHaveLength(1);
    });
  });

  describe('AlsaGroupSchema', () => {
    it('should parse a group with properties array', () => {
      const result = AlsaGroupSchema.parse({
        id: 1,
        name: 'Group 1',
        properties: [{id: 1}, {id: 4}],
      });
      expect(result.properties).toHaveLength(2);
    });
  });

  describe('AlsaLibConfigSchema', () => {
    it('should normalise fileType to uppercase', () => {
      const result = AlsaLibConfigSchema.parse({
        includeTlvHeader: false,
        fileType: 'bin',
        groups: [],
      });
      expect(result.fileType).toBe('BIN');
    });

    it('should reject an unknown fileType', () => {
      expect(() =>
        AlsaLibConfigSchema.parse({
          includeTlvHeader: false,
          fileType: 'XML',
          groups: [],
        }),
      ).toThrow();
    });
  });

  describe('ConfigurationSchema', () => {
    it('should parse a valid configuration and unwrap wrapper objects', () => {
      const result = ConfigurationSchema.parse(VALID_CONFIGURATION);
      expect(result.portStrategy).toBe('SEQUENTIAL');
      expect(result.defaultProcessorDomain).toBe(2);
      expect(result.rtc.processors[0].pidSize).toBe(8192);
      expect(result.alsaLib.groups[0].properties).toEqual([{id: 1}, {id: 4}]);
    });

    it('should reject an invalid portStrategy enum value', () => {
      const bad = {...VALID_CONFIGURATION, portStrategy: {strategy: 'UNKNOWN'}};
      expect(() => ConfigurationSchema.parse(bad)).toThrow();
    });

    it('should reject missing rtc processors field', () => {
      const {rtc: _rtc, ...rest} = VALID_CONFIGURATION;
      expect(() => ConfigurationSchema.parse(rest)).toThrow();
    });
  });

  describe('ConfigurationDataSchema (normalised output shape)', () => {
    it('should accept the output of ConfigurationSchema', () => {
      const parsed = ConfigurationSchema.parse(VALID_CONFIGURATION);
      const result = ConfigurationDataSchema.parse(parsed);
      expect(result.portStrategy).toBe('SEQUENTIAL');
    });
  });
});
