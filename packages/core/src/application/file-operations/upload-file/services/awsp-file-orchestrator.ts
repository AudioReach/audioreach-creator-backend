// IMPORTANT: reflect-metadata must be imported first, before any other imports
// This polyfill is required for class-transformer decorators to work
import 'reflect-metadata';

import {AwspParser} from './awsp-parser.js';
import {
  FILE_NAMES,
  FILE_EXTENSIONS,
} from '../../shared/constants/definition-block-names.js';
import type {FileReaderPort} from '../../../ports/file-system/file-reader.port.js';
import type {PathRef} from '../../shared/utils/file-ref.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import {ParsedAwsp, type DefinitionBlockName} from '../models/parsed-awsp.js';

/**
 * Orchestrator for AWSP file parsing.
 * Manages file operations, unzipping, and coordinates definition parsing workflow.
 */
export class AwspFileOrchestrator {
  private readonly definitionParser: AwspParser;

  constructor(
    private readonly fs: FileReaderPort,
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
      msg: 'AWSP parsing started',
      action: 'parse_awsp_start',
      component: 'AwspFileOrchestrator',
      tag: 'parsing',
      timestamp: new Date(),
    });

    try {
      // Unzip the .awsp file
      unzippedFolderPath = await this.unzipAwspFile(awspFilePath.uri);

      // Look for definition.json file specifically
      const definitionFilePath = this.fs.joinPath(
        unzippedFolderPath,
        FILE_NAMES.DEFINITIONS_JSON,
      );

      // Check if definition.json exists
      const definitionExists = await this.fs.exists(definitionFilePath);
      if (!definitionExists) {
        throw new Error(
          `${FILE_NAMES.DEFINITIONS_JSON} file not found in the unzipped folder`,
        );
      }

      // Read the entire JSON file as bytes and convert to text
      const fileRef: PathRef = {
        kind: 'path',
        name: definitionFilePath,
        uri: definitionFilePath,
        mimeType: 'application/json',
      };
      const fileBytes = await this.fs.readAll(fileRef);
      const jsonContent = new TextDecoder('utf8').decode(fileBytes);
      const jsonData = JSON.parse(jsonContent);

      // Parse all definitions using the AwspParser
      const definitions =
        await this.definitionParser.parseDefinitions(jsonData);

      // Create ParsedAwsp instance and populate it with parsed definitions
      const parsedAwsp = new ParsedAwsp();

      // Map the parsed definitions to the ParsedAwsp structure
      this.populateParsedAwsp(parsedAwsp, definitions);

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: `AWSP parsing completed in ${duration}ms`,
        action: 'parse_awsp_complete',
        component: 'AwspFileOrchestrator',
        tag: 'parsing',
        timestamp: new Date(),
      });

      return parsedAwsp;
    } catch (error) {
      this.logger?.logError({
        msg: 'AWSP parsing failed',
        action: 'parse_awsp_failed',
        component: 'AwspFileOrchestrator',
        tag: 'parsing',
        error: error as Error,
        timestamp: new Date(),
      });

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
            msg: 'Failed to delete unzipped folder',
            action: 'cleanup_failed',
            component: 'AwspFileOrchestrator',
            tag: 'cleanup',
            error: cleanupError as Error,
            timestamp: new Date(),
          });
        }
      }
    }
  }

  /**
   * Unzip .awsp file to a folder in the same directory
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

      // Get the directory and filename without extension
      const fileDir = this.fs.dirname(awspFilePath);
      const fileName = this.fs.basename(awspFilePath, FILE_EXTENSIONS.AWSP);

      // Create folder name (e.g., if file is "project.awsp", folder will be "project_unzipped")
      const unzippedFolderName = `${fileName}_unzipped`;
      const unzippedFolderPath = this.fs.joinPath(fileDir, unzippedFolderName);

      // Use platform-specific unzip implementation
      await this.fs.unzip(awspFilePath, unzippedFolderPath);

      return unzippedFolderPath;
    } catch (error) {
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
   * @param definitions - The parsed definitions from AwspParser (already structured with DefinitionBlockName keys)
   */
  private populateParsedAwsp(
    parsedAwsp: ParsedAwsp,
    definitions: Record<DefinitionBlockName, any>,
  ): void {
    // Since the parser now returns structured definitions with DefinitionBlockName keys,
    // we can directly iterate and add them to ParsedAwsp
    for (const [definitionType, definitionCollection] of Object.entries(
      definitions,
    )) {
      if (
        definitionCollection &&
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
