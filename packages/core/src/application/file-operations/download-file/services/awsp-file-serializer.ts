/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import {
  FILE_NAMES,
  FILE_EXTENSIONS,
  DEFINITION_BLOCK_NAMES,
} from '../../shared/constants/definition-block-names.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import type {AwspFileHeader} from '../../shared/awsp-serializers/headers/index.js';
import type {WorkspaceFileVersion} from '../../shared/awsp-serializers/version.js';
import {AwspDefinitionsMapper} from './awsp-definitions-mapper.js';

const AWSP_MAGIC = 'AWSP';

/**
 * Serializes domain entities to AWSP format.
 *
 * AWSP file binary layout:
 *   [4]  Magic "AWSP"
 *   [4]  Header length (uint32 little-endian)
 *   [N]  Header JSON (UTF-8)
 *   [4]  Raw data length (uint32 little-endian)
 *   [M]  ZIP archive containing:
 *          definitions.json, configuration.json, ui-metadata.json
 */
export class AwspFileSerializer {
  constructor(private readonly fileSystem: FileSystemPort) {}

  /**
   * Serialize entities to AWSP file format.
   *
   * @param _entities - Domain entities from database (unused in empty file implementation)
   * @param options - Optional metadata written into the binary header
   * @returns AWSP file as Uint8Array
   * @throws Error if ZIP creation or binary wrapping fails
   */
  async serialize(
    entities: DownloadEntities,
    options?: {
      acdbFilePath?: string;
      eacFilePath?: string;
      version?: WorkspaceFileVersion;
    },
  ): Promise<Uint8Array> {
    try {
      const mapper = new AwspDefinitionsMapper();

      const keyDefs = entities.keyDefinitions
        ? mapper.toAwspKeyDefinitions(entities.keyDefinitions)
        : [];
      const tagDefs = entities.tagDefinitions
        ? mapper.toAwspTagDefinitions(entities.tagDefinitions)
        : [];
      const spfModDefs = entities.spfModuleDefinitions
        ? mapper.toAwspSpfModuleDefinitions(entities.spfModuleDefinitions)
        : [];
      const driverModDefs = entities.driverModuleDefinitions
        ? mapper.toDriverModuleDefinitions(entities.driverModuleDefinitions)
        : [];
      const spfPropDefs = entities.spfPropertyDefinitions
        ? mapper.toSpfPropertyDefinitions(entities.spfPropertyDefinitions)
        : [];
      const driverPropDefs = entities.driverPropertyDefinitions
        ? mapper.toDriverPropertyDefinitions(entities.driverPropertyDefinitions)
        : [];
      const processorDefs = entities.processorDefinitions
        ? mapper.toProcessorDefinitions(entities.processorDefinitions)
        : [];
      const containerTypeDefs = entities.containerTypeDefinitions
        ? mapper.toContainerTypeDefinitions(entities.containerTypeDefinitions)
        : [];

      const definitions = {
        [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: keyDefs.map(k => k.toJSON()),
        [DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]: tagDefs.map(t => t.toJSON()),
        [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: spfModDefs.map(m =>
          m.toJSON(),
        ),
        [DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS]: driverModDefs.map(
          m => m.toJSON(),
        ),
        [DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS]: spfPropDefs.map(p =>
          p.toJSON(),
        ),
        [DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS]:
          driverPropDefs.map(p => p.toJSON()),
        [DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS]: processorDefs.map(p =>
          p.toJSON(),
        ),
        [DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES]:
          containerTypeDefs.map(ct => ct.toJSON()),
      };

      const files = new Map<string, string>([
        [FILE_NAMES.DEFINITIONS_JSON, JSON.stringify(definitions)],
        [FILE_NAMES.CONFIGURATION_JSON, this.buildConfigurationJson(entities)],
        [
          FILE_NAMES.UI_METADATA_JSON,
          JSON.stringify({version: {major: 1, minor: 0}}),
        ],
      ]);

      const zipBuffer = await this.fileSystem.zipToBuffer(files);

      const header: AwspFileHeader = {
        version: options?.version ?? {major: 9, minor: 0},
        acdbFilePath: options?.acdbFilePath ?? '',
        eacFilePath: options?.eacFilePath ?? '',
        workspaceFileInfo: {type: 'JSON', isZipped: true, isEncrypted: false},
      };

      return this.buildBinaryEnvelope(zipBuffer, header);
    } catch (error) {
      throw new Error(
        `Failed to serialize ${FILE_EXTENSIONS.AWSP} file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build the wire-format configuration.json string from persisted configuration data.
   * Re-wraps portStrategy and defaultProcessorDomain into the object shapes that
   * PortStrategySchema and ProcessorDomainIdSchema expect during upload parsing.
   */
  private buildConfigurationJson(entities: DownloadEntities): string {
    const config = entities.configurationData;
    if (!config) return '{}';

    const hexId = `0x${config.defaultProcessorDomain.toString(16).toUpperCase().padStart(8, '0')}`;
    const configJson = {
      portStrategy: {strategy: config.portStrategy},
      defaultProcessorDomain: {id: hexId},
      rtc: JSON.parse(config.rtcConfig) as unknown,
      alsaLib: JSON.parse(config.alsaLibConfig) as unknown,
    };
    return JSON.stringify(configJson);
  }

  /**
   * Wrap a ZIP buffer with the AWSP binary envelope:
   *   MAGIC(4) + headerLength(4) + headerBytes(N) + rawLength(4) + zipBytes(M)
   */
  private buildBinaryEnvelope(
    zipData: Uint8Array,
    header: AwspFileHeader,
  ): Uint8Array {
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));

    const totalSize =
      BinaryUtils.SIZEOF_UINT32 + // magic
      BinaryUtils.SIZEOF_UINT32 + // header length
      headerBytes.byteLength +
      BinaryUtils.SIZEOF_UINT32 + // raw data length
      zipData.byteLength;

    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;

    result.set(new TextEncoder().encode(AWSP_MAGIC), offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, headerBytes.byteLength);
    offset += BinaryUtils.SIZEOF_UINT32;

    result.set(headerBytes, offset);
    offset += headerBytes.byteLength;

    BinaryUtils.writeUint32(view, offset, zipData.byteLength);
    offset += BinaryUtils.SIZEOF_UINT32;

    result.set(zipData, offset);

    return result;
  }
}
