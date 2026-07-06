/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeAll} from '@jest/globals';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {AwspFileOrchestrator} from '../../../../src/application/file-operations/upload-file/services/awsp-file-orchestrator.js';
import {NodeFileSystemAdapter} from '@arc/fs';
import {ParsedAwsp} from '../../../../src/application/file-operations/upload-file/models/parsed-awsp.js';
import type {PathRef} from '../../../../src/application/file-operations/shared/utils/file-ref.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('AWSP Parser Integration Tests', () => {
  let orchestrator: AwspFileOrchestrator;

  beforeAll(() => {
    const fs = new NodeFileSystemAdapter();
    orchestrator = new AwspFileOrchestrator(fs);
  });

  describe('parseAWSP with workspaceFileXml.awsp', () => {
    const awspPath: PathRef = {
      kind: 'path',
      uri: join(
        __dirname,
        '../../../../../api/tests/e2e/fixtures/workspaceFileXml.awsp',
      ),
      name: 'workspaceFileXml.awsp',
    };

    it('should successfully parse the AWSP file', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);

      expect(parsedAwsp).toBeInstanceOf(ParsedAwsp);
      expect(parsedAwsp.getConfiguration()).toBeDefined();
    });

    it('should parse all definition types', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);

      const tagDefs = parsedAwsp.getTagDefinitions();
      expect(tagDefs).toBeDefined();
      expect(Array.isArray(tagDefs)).toBe(true);
      expect(tagDefs!.length).toBeGreaterThan(0);

      const keyDefs = parsedAwsp.getKeyDefinitions();
      expect(keyDefs).toBeDefined();
      expect(Array.isArray(keyDefs)).toBe(true);
      expect(keyDefs!.length).toBeGreaterThan(0);

      const spfPropDefs = parsedAwsp.getSpfPropertyDefinitions();
      expect(spfPropDefs).toBeDefined();
      expect(Array.isArray(spfPropDefs)).toBe(true);

      const driverPropDefs = parsedAwsp.getDriverPropertyDefinitions();
      expect(driverPropDefs).toBeDefined();
      expect(Array.isArray(driverPropDefs)).toBe(true);

      const spfModuleDefs = parsedAwsp.getSpfModuleDefinitions();
      expect(spfModuleDefs).toBeDefined();
      expect(Array.isArray(spfModuleDefs)).toBe(true);
      expect(spfModuleDefs!.length).toBeGreaterThan(0);

      const driverModuleDefs = parsedAwsp.getDriverModuleDefinitions();
      // Driver module definitions may not exist in all test files
      if (driverModuleDefs) {
        expect(Array.isArray(driverModuleDefs)).toBe(true);
      }

      const processorDefs = parsedAwsp.getProcessorDefinitions();
      expect(processorDefs).toBeDefined();
      expect(Array.isArray(processorDefs)).toBe(true);

      const containerTypes = parsedAwsp.getContainerTypes();
      expect(containerTypes).toBeDefined();
      expect(Array.isArray(containerTypes)).toBe(true);
    });

    it('should validate tag definition data integrity', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);
      const tagDefs = parsedAwsp.getTagDefinitions();

      expect(tagDefs).toBeDefined();
      expect(tagDefs!.length).toBeGreaterThan(0);

      for (const tag of tagDefs!) {
        expect(tag.id).toBeDefined();
        expect(typeof tag.id).toBe('number');
        expect(tag.name).toBeDefined();
        expect(typeof tag.name).toBe('string');
        expect(tag.name.length).toBeGreaterThan(0);
      }
    });

    it('should validate SPF module definition data integrity', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);
      const spfModules = parsedAwsp.getSpfModuleDefinitions();

      expect(spfModules).toBeDefined();
      expect(spfModules!.length).toBeGreaterThan(0);

      for (const module of spfModules!) {
        expect(module.id).toBeDefined();
        expect(typeof module.id).toBe('number');
        expect(module.name).toBeDefined();
        expect(typeof module.name).toBe('string');
        //expect(module.supportedProcessorIds).toBeDefined(); //TODO: Re-enable once supportedProcessorIds is consistently present in test files
        //expect(Array.isArray(module.supportedProcessorIds)).toBe(true); //TODO: Re-enable once supportedProcessorIds is consistently present in test files
        expect(module.containerTypes).toBeDefined();
        expect(Array.isArray(module.containerTypes)).toBe(true);
      }
    });

    it('should validate configuration data', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);
      const config = parsedAwsp.getConfiguration();

      expect(config).toBeDefined();
      expect(config.portStrategy).toBeDefined();
      expect(['INPUT_EVEN_OUTPUT_ODD', 'SEQUENTIAL']).toContain(
        config.portStrategy,
      );
      expect(config.defaultProcessorDomain).toBeDefined();
    });

    it('should report correct definition counts', async () => {
      const parsedAwsp = await orchestrator.parseAWSP(awspPath);

      const typeCount = parsedAwsp.getDefinitionTypeCount();
      expect(typeCount).toBeGreaterThan(0);
      expect(typeCount).toBeLessThanOrEqual(10);

      const totalCount = parsedAwsp.getTotalDefinitionCount();
      expect(totalCount).toBeGreaterThan(0);
    });
  });
});
