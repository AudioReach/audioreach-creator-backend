/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspParser, AwspUnsupportedVersionError} from './awsp-parser.js';
import {z} from 'zod';
import {
  FILE_NAMES,
  FILE_EXTENSIONS,
} from '../../shared/constants/definition-block-names.js';
import {Configuration} from '../../shared/awsp-serializers/v1/configuration/configuration.js';
import {UiMetadata} from '../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {PathRef} from '../../shared/utils/file-ref.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {JsonObject} from '../../../../shared/types/json-types.js';
import {
  ParsedAwsp,
  type DefinitionBlockName,
  type DefinitionCollection,
} from '../models/parsed-awsp.js';

/**
 * Orchestrator for AWSP file parsing.
 * Manages file operations, unzipping, and coordinates definition parsing workflow.
 */
export class AwspFileOrchestrator {
  private readonly definitionParser: AwspParser;

  constructor(
    private readonly fs: FileSystemPort,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {
    this.fs = fs;
    this.definitionParser = new AwspParser(this.workerPool);
  }

  /**
   * Parse .awsp file by unzipping it and extracting contents
   * @param awspFilePath - Path to the .awsp file
   * @returns Promise resolving to ParsedAwsp instance
   */
  async parseAWSP(awspFilePath: PathRef): Promise<ParsedAwsp> {
    let unzippedFolderPath: string | undefined;
    const startTime = Date.now();

    this.logger?.logInfo({
      msg: 'awsp_parsing_started',
      description: 'AWSP parsing started',
      component: 'AwspFileOrchestrator',
      tag: 'parsing',
    });

    try {
      // Unzip the .awsp file
      unzippedFolderPath = await this.unzipAwspFile(awspFilePath.uri);

      // definitions.json
      const jsonData = await this.readJsonFile(
        unzippedFolderPath,
        FILE_NAMES.DEFINITIONS_JSON,
        (raw): Record<string, JsonObject[]> => {
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            throw new Error(
              'Invalid JSON structure: expected an object with definition blocks',
            );
          }
          return raw as Record<string, JsonObject[]>;
        },
      );
      const definitions =
        await this.definitionParser.parseDefinitions(jsonData);
      const parsedAwsp = new ParsedAwsp();
      this.populateParsedAwsp(parsedAwsp, definitions);

      // configuration.json
      const configurationInstance = await this.readJsonFile(
        unzippedFolderPath,
        FILE_NAMES.CONFIGURATION_JSON,
        raw => Configuration.fromJSON(raw),
      );
      const configurationData = configurationInstance.configuration;
      parsedAwsp.setConfiguration(configurationData);

      // ui-metadata.json
      const uiMetadata = await this.readJsonFile(
        unzippedFolderPath,
        FILE_NAMES.UI_METADATA_JSON,
        raw => UiMetadata.fromJSON(raw),
      );
      parsedAwsp.setUiMetadata(uiMetadata);

      this.logger?.logInfo({
        msg: 'awsp_configuration_parsed',
        description: `Configuration parsed successfully with portStrategy: ${configurationData.portStrategy}, defaultProcessorDomain: ${configurationData.defaultProcessorDomain}`,
        component: 'AwspFileOrchestrator',
        tag: 'parsing',
      });

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: 'awsp_parsing_completed',
        description: `AWSP parsing completed in ${duration}ms`,
        component: 'AwspFileOrchestrator',
        tag: 'parsing',
      });

      return parsedAwsp;
    } catch (error) {
      this.logger?.logError({
        msg: 'awsp_parsing_failed',
        description: 'AWSP parsing failed',
        component: 'AwspFileOrchestrator',
        tag: 'parsing',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      if (error instanceof AwspUnsupportedVersionError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new Error(
          `Failed to parse ${FILE_EXTENSIONS.AWSP} file: configuration.json: ${AwspParser.formatZodError(error)}`,
        );
      }
      if (error instanceof Error) {
        throw new Error(
          `Failed to parse ${FILE_EXTENSIONS.AWSP} file: ${error.message}`,
        );
      }
      throw new Error(
        `Failed to parse ${FILE_EXTENSIONS.AWSP} file: Unknown error`,
      );
    } finally {
      // Clean up: Delete the unzipped folder
      if (unzippedFolderPath) {
        try {
          await this.deleteUnzippedFolder(unzippedFolderPath);
        } catch (cleanupError) {
          // Log cleanup error but don't throw - parsing was successful
          this.logger?.logError({
            msg: 'awsp_cleanup_failed',
            description: 'Failed to delete unzipped folder',
            component: 'AwspFileOrchestrator',
            tag: 'cleanup',
            error:
              cleanupError instanceof Error
                ? cleanupError
                : new Error(String(cleanupError)),
          });
        }
      }
    }
  }

  /**
   * Unzip .awsp file to a folder in the same directory.
   * Reads the binary envelope (magic + header + ZIP payload) before extracting.
   * @param awspFilePath - Path to the .awsp file
   * @returns Promise resolving to the path of the unzipped folder
   */
  private async unzipAwspFile(awspFilePath: string): Promise<string> {
    try {
      // Validate file exists
      const fileExists = await this.fs.exists(awspFilePath);
      if (!fileExists) {
        throw new Error(`File not found: ${awspFilePath}`);
      }

      // Read the entire .awsp file
      const fileRef: PathRef = {
        kind: 'path',
        name: awspFilePath,
        uri: awspFilePath,
        mimeType: 'application/octet-stream',
      };
      const fileBytes = await this.fs.readAll(fileRef);

      // Parse binary envelope to extract the ZIP payload
      const {zipData} = this.definitionParser.parseEnvelope(fileBytes);

      // Determine output folder path
      const fileDir = this.fs.dirname(awspFilePath);
      const fileName = this.fs.basename(awspFilePath, FILE_EXTENSIONS.AWSP);
      const unzippedFolderName = `${fileName}_unzipped`;
      const unzippedFolderPath = this.fs.joinPath(fileDir, unzippedFolderName);

      // Extract ZIP payload into the output folder
      await this.fs.unzipBuffer(zipData, unzippedFolderPath);

      return unzippedFolderPath;
    } catch (error) {
      if (error instanceof AwspUnsupportedVersionError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new Error(
          `Failed to unzip ${FILE_EXTENSIONS.AWSP} file: ${error.message}`,
        );
      }
      throw new Error(
        `Failed to unzip ${FILE_EXTENSIONS.AWSP} file: Unknown error`,
      );
    }
  }

  /**
   * Populate ParsedAwsp instance with parsed definitions
   * @param parsedAwsp - The ParsedAwsp instance to populate
   * @param definitions - The parsed definitions from AwspParser (only includes blocks with data)
   */
  private populateParsedAwsp(
    parsedAwsp: ParsedAwsp,
    definitions: Record<string, DefinitionCollection>,
  ): void {
    // Iterate through parsed definitions and add them to ParsedAwsp
    for (const [definitionType, definitionCollection] of Object.entries(
      definitions,
    )) {
      // All entries in definitions already have data (no null values)
      if (
        Array.isArray(definitionCollection) &&
        definitionCollection.length > 0
      ) {
        parsedAwsp.addDefinitions(
          definitionType as DefinitionBlockName,
          definitionCollection,
        );
      }
    }
  }

  /**
   * Delete the unzipped folder after parsing is complete
   * @param folderPath - Path to the folder to delete
   */
  private async readJsonFile<T>(
    folder: string,
    filename: string,
    parse: (raw: unknown) => T,
  ): Promise<T> {
    const filePath = this.fs.joinPath(folder, filename);

    const exists = await this.fs.exists(filePath);
    if (!exists) {
      throw new Error(`${filename} file not found in the unzipped folder`);
    }

    const fileRef: PathRef = {
      kind: 'path',
      name: filePath,
      uri: filePath,
      mimeType: 'application/json',
    };

    const bytes = await this.fs.readAll(fileRef);
    const raw: unknown = JSON.parse(new TextDecoder('utf8').decode(bytes));
    return parse(raw);
  }

  private async deleteUnzippedFolder(folderPath: string): Promise<void> {
    try {
      const folderExists = await this.fs.exists(folderPath);
      if (folderExists) {
        this.fs.deleteDirectory(folderPath);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to delete unzipped folder: ${error.message}`);
      }
      throw new Error('Failed to delete unzipped folder: Unknown error');
    }
  }
}
