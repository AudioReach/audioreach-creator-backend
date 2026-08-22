/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {AwspFileSerializer} from '../../../../../../src/application/file-operations/download-file/services/awsp-file-serializer.js';
import type {DownloadEntities} from '../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../../../../src/application/ports/file-system/file-system.port.js';
import {
  FILE_NAMES,
  DEFINITION_BLOCK_NAMES,
} from '../../../../../../src/application/file-operations/shared/constants/definition-block-names.js';

describe('AwspFileSerializer', () => {
  describe('serialize', () => {
    it('should create ZIP with 3 JSON files including definitions structure', async () => {
      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            // Verify 3 files are passed
            expect(files.size).toBe(3);
            expect(files.has(FILE_NAMES.DEFINITIONS_JSON)).toBe(true);
            expect(files.has(FILE_NAMES.CONFIGURATION_JSON)).toBe(true);
            expect(files.has(FILE_NAMES.UI_METADATA_JSON)).toBe(true);

            // definitions.json contains the 8-block structure with empty arrays
            const defsJson = files.get(FILE_NAMES.DEFINITIONS_JSON) as string;
            const defs = JSON.parse(defsJson) as Record<string, unknown>;
            expect(defs[DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]).toEqual([]);
            expect(defs[DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]).toEqual([]);

            // configuration.json and ui-metadata.json are empty objects
            expect(files.get(FILE_NAMES.CONFIGURATION_JSON)).toBe('{}');
            expect(files.get(FILE_NAMES.UI_METADATA_JSON)).toBe(
              JSON.stringify({
                version: {major: 1, minor: 0},
                payloadMap: [],
                usecases: [],
                subsystems: [],
                subgraphs: [],
                modules: [],
                dataLinks: [],
                switches: [],
              }),
            );

            // Return mock ZIP buffer
            return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP file signature
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      expect(mockFileSystem.zipToBuffer).toHaveBeenCalledTimes(1);
    });

    it('should return valid ZIP buffer', async () => {
      const mockZipBuffer = new Uint8Array([
        0x50,
        0x4b,
        0x03,
        0x04, // ZIP signature
        0x00,
        0x00,
        0x00,
        0x00,
      ]);

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(async () => mockZipBuffer),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      const result = await serializer.serialize(entities);

      expect(result).toBeInstanceOf(Uint8Array);
      // Result is an AWSP binary envelope (starts with 'AWSP' magic)
      expect(result[0]).toBe(0x41); // 'A'
      expect(result[1]).toBe(0x57); // 'W'
      expect(result[2]).toBe(0x53); // 'S'
      expect(result[3]).toBe(0x50); // 'P'
      // The ZIP data is embedded inside the envelope
      expect(result.length).toBeGreaterThan(mockZipBuffer.length);
    });

    it('should throw error if ZIP creation fails', async () => {
      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(async () => {
          throw new Error('ZIP creation failed');
        }),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);

      await expect(serializer.serialize(entities)).rejects.toThrow(
        'Failed to serialize .awsp file',
      );
    });

    it('should pass correct file names to zipToBuffer', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      expect(capturedFiles).toBeDefined();
      expect(Array.from(capturedFiles!.keys())).toEqual([
        'definitions.json',
        'configuration.json',
        'ui-metadata.json',
      ]);
    });

    it('should write definitions.json with 8-block object when no key/tag entities provided', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      const definitionsJson = capturedFiles!.get(
        FILE_NAMES.DEFINITIONS_JSON,
      ) as string;
      const definitions = JSON.parse(definitionsJson) as Record<
        string,
        unknown[]
      >;

      expect(
        Array.isArray(definitions[DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]),
      ).toBe(true);
      expect(definitions[DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]).toHaveLength(
        0,
      );
      expect(
        Array.isArray(definitions[DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]),
      ).toBe(true);
      expect(definitions[DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]).toHaveLength(
        0,
      );
      expect(
        Array.isArray(
          definitions[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS],
        ),
      ).toBe(true);
    });

    it('should serialize spfModuleDefinitions from entities into definitions.json', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
        spfModuleDefinitions: [
          {
            moduleDefinitionId: 0x100,
            name: 'TestMod',
            stackSize: 0,
            params: [],
            portGroups: [],
            staticControlPorts: [],
            dynamicIntents: [],
            supportedProcessorIds: [],
            supportedContainerTypes: [],
          },
        ],
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      const definitionsJson = capturedFiles!.get(
        FILE_NAMES.DEFINITIONS_JSON,
      ) as string;
      const definitions = JSON.parse(definitionsJson) as Record<
        string,
        unknown[]
      >;

      expect(
        definitions[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS],
      ).toHaveLength(1);
      const mod = (
        definitions[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS] as unknown[]
      )[0] as Record<string, unknown>;
      expect(mod['id']).toBe(0x100);
      expect(mod['name']).toBe('TestMod');
    });

    it('should serialize driverModuleDefinitions from entities into definitions.json', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
        driverModuleDefinitions: [
          {
            moduleDefinitionId: 0xd100,
            name: 'DriverMod',
            params: [],
          },
        ],
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      const definitionsJson = capturedFiles!.get(
        FILE_NAMES.DEFINITIONS_JSON,
      ) as string;
      const definitions = JSON.parse(definitionsJson) as Record<
        string,
        unknown[]
      >;

      expect(
        definitions[DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS],
      ).toHaveLength(1);
      const mod = (
        definitions[
          DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS
        ] as unknown[]
      )[0] as Record<string, unknown>;
      expect(mod['id']).toBe(0xd100);
    });

    it('should serialize spfPropertyDefinitions from entities into definitions.json', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
        spfPropertyDefinitions: [
          {
            propertyId: 1001,
            name: 'SgProp',
            maxSize: 4,
            elementsStructure: '[]',
            categoryName: 'SG_CFG',
          },
        ],
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      const definitionsJson = capturedFiles!.get(
        FILE_NAMES.DEFINITIONS_JSON,
      ) as string;
      const definitions = JSON.parse(definitionsJson) as Record<
        string,
        unknown[]
      >;

      expect(
        definitions[DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS],
      ).toHaveLength(1);
      const prop = (
        definitions[
          DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS
        ] as unknown[]
      )[0] as Record<string, unknown>;
      expect(prop['id']).toBe(1001);
    });

    it('should serialize driverPropertyDefinitions from entities into definitions.json', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
        driverPropertyDefinitions: [
          {
            propertyId: 3001,
            name: 'ModProp',
            maxSize: 4,
            propertyStructure: '[]',
          },
        ],
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      const definitionsJson = capturedFiles!.get(
        FILE_NAMES.DEFINITIONS_JSON,
      ) as string;
      const definitions = JSON.parse(definitionsJson) as Record<
        string,
        unknown[]
      >;

      expect(
        definitions[DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS],
      ).toHaveLength(1);
      const prop = (
        definitions[
          DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS
        ] as unknown[]
      )[0] as Record<string, unknown>;
      expect(prop['id']).toBe(3001);
    });
  });
});
