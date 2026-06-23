/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {DEFINITION_BLOCK_NAMES} from '../../shared/constants/definition-block-names.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../ports/worker/worker-types.js';
import type {JsonObject} from '../../../../shared/types/json-types.js';
import {type DefinitionCollection} from '../models/parsed-awsp.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import {type AwspFileHeader} from '../../shared/awsp-serializers/headers/index.js';
import {
  type WorkspaceFileVersion,
  type AwspVersionKey,
  awspVersionKey,
} from '../../shared/awsp-serializers/version.js';
import {parseHeader_V9_0} from '../../shared/awsp-serializers/headers/v9.0.js';
import {
  KeyDefinitionSchema,
  TagDefinitionSchema,
  SpfPropertyDefinitionSchema,
  DriverPropertyDefinitionSchema,
  ContainerTypeSchema,
  ProcessorDefinitionSchema,
  AwspSpfModuleDefinitionSchema,
  AwspDriverModuleDefinitionSchema,
  AwspVcpmModuleDefinitionSchema,
  AwspKeyDefinition,
  AwspTagDefinition,
  SpfPropertyDefinition,
  DriverPropertyDefinition,
  AwspSpfModuleDefinition,
  DriverModuleDefinition,
  AwspVcpmModuleDefinition,
  ProcessorDefinition,
  ContainerType,
} from '../../shared/awsp-serializers/v1/definitions/index.js';

const AWSP_MAGIC = 'AWSP';

export class AwspUnsupportedVersionError extends Error {
  constructor(public readonly version: WorkspaceFileVersion) {
    const supported = Object.keys(HEADER_PARSERS).join(', ');
    super(
      `Unsupported AWSP file version ${version.major}.${version.minor}. Supported: ${supported}`,
    );
    this.name = 'AwspUnsupportedVersionError';
  }
}

type VersionHeaderParser = (rawHeader: unknown) => AwspFileHeader;

const HEADER_PARSERS: Partial<Record<AwspVersionKey, VersionHeaderParser>> = {
  '9.0': parseHeader_V9_0,
};

function parseAwspHeader(rawHeader: unknown): AwspFileHeader {
  const version = probeVersion(rawHeader);
  const key = awspVersionKey(version);
  const parser = HEADER_PARSERS[key];
  if (!parser) {
    throw new AwspUnsupportedVersionError(version);
  }
  return parser(rawHeader);
}

function probeVersion(raw: unknown): WorkspaceFileVersion {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('version' in raw) ||
    typeof (raw as Record<string, unknown>).version !== 'object'
  ) {
    throw new Error('AWSP header JSON is missing the required "version" field');
  }
  const v = (raw as {version: Record<string, unknown>}).version;
  if (typeof v.major !== 'number' || typeof v.minor !== 'number') {
    throw new Error(
      'AWSP header "version" must have numeric "major" and "minor" fields',
    );
  }
  return {major: v.major, minor: v.minor};
}

/**
 * Input structure for definition parsing tasks
 */
export interface DefinitionParseInput {
  /** Object containing definition blocks to parse */
  definitionBlocks: Record<string, JsonObject[]>;
  /** Human-readable name for error messages */
  taskName: string;
}

/**
 * Service responsible for parsing AWSP definition content.
 * Contains all definition parsing business logic with parallel processing support.
 */
export class AwspParser {
  constructor(private readonly workerPool?: WorkerPoolPort) {}

  /**
   * Static method for parsing definitions in worker threads.
   * This method is called by the worker registry and contains the core parsing logic.
   * @param input - Definition parsing input containing blocks to parse
   * @param logger - Optional logger for debug output
   * @returns Parsed definitions object (only includes blocks with data)
   */
  static parse(
    input: DefinitionParseInput,
  ): Record<string, DefinitionCollection> {
    const results: Record<string, DefinitionCollection> = {};

    // Process each definition block provided in the input
    for (const [blockName, blockData] of Object.entries(
      input.definitionBlocks,
    )) {
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        try {
          // Get the appropriate Zod schema for this block
          const schema = AwspParser.getSchemaForBlock(blockName);

          // Parse and validate with Zod
          const validated = schema.parse(blockData) as unknown[];

          // Hydrate to class instances using fromJSON
          const hydrated = AwspParser.hydrateDefinitions(blockName, validated);

          results[blockName] = hydrated;
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new Error(
              `Failed to parse ${blockName} (${blockData.length} items): ${AwspParser.formatZodError(error)}`,
            );
          }
          if (error instanceof Error) {
            throw new Error(`Failed to parse ${blockName}: ${error.message}`);
          }
          throw new Error(`Failed to parse ${blockName}: Unknown error`);
        }
      }
    }

    return results;
  }

  /**
   * Groups Zod issues by (field path + message) and emits one line per distinct
   * problem, showing how many items are affected and the actual value from the
   * first occurrence.  Prevents 70+ identical repetitions in the log.
   *
   * Example output:
   *   [x72] [n].id: expected number, received string — first at index 0, got "0x00000001"
   *   [x1]  [3].name: Required
   */
  static formatZodError(error: z.ZodError): string {
    const groups = new Map<
      string,
      {count: number; firstIndex: number; received: unknown}
    >();

    for (const issue of error.issues) {
      const path = issue.path;
      // The first segment of the path is the array index when validating z.array(...)
      const index = typeof path[0] === 'number' ? path[0] : -1;
      const fieldPath =
        index >= 0
          ? `[n].${path.slice(1).join('.')}`
          : path.join('.') || '(root)';
      const key = `${fieldPath}|${issue.message}`;

      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const received =
          'received' in issue
            ? (issue as {received: unknown}).received
            : undefined;
        groups.set(key, {count: 1, firstIndex: index, received});
      }
    }

    return [...groups.entries()]
      .map(([key, {count, firstIndex, received}]) => {
        const [fieldPath, message] = key.split('|');
        const countTag = `[x${count}]`.padEnd(6);
        const location =
          firstIndex >= 0 ? ` — first at index ${firstIndex}` : '';
        const receivedTag =
          received === undefined ? '' : `, got ${JSON.stringify(received)}`;
        return `${countTag} ${fieldPath}: ${message}${location}${receivedTag}`;
      })
      .join('; ');
  }

  /**
   * Static method to map definition block names to their corresponding Zod schemas.
   * This enables generic definition parsing without hardcoded type logic.
   */
  private static getSchemaForBlock(blockName: string): z.ZodSchema {
    const schemaMap: Record<string, z.ZodSchema> = {
      [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: z.array(KeyDefinitionSchema),
      [DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]: z.array(TagDefinitionSchema),
      [DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS]: z.array(
        SpfPropertyDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS]: z.array(
        DriverPropertyDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: z.array(
        AwspSpfModuleDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS]: z.array(
        AwspDriverModuleDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.VCPM_MODULE_DEFINITIONS]: z.array(
        AwspVcpmModuleDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS]: z.array(
        ProcessorDefinitionSchema,
      ),
      [DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES]:
        z.array(ContainerTypeSchema),
    };

    const schema = schemaMap[blockName];
    if (!schema) {
      throw new Error(`Unknown definition block name: ${blockName}`);
    }
    return schema;
  }

  /**
   * Hydrate plain Zod-validated objects to class instances using fromJSON.
   * @param blockName - The definition block name
   * @param data - Array of plain objects from Zod validation
   * @returns Array of class instances
   */
  private static hydrateDefinitions(
    blockName: string,
    data: unknown[],
  ): DefinitionCollection {
    const hydratorMap: Record<
      string,
      {
        fromParsed?: (data: unknown) => unknown;
        fromJSON: (data: unknown) => unknown;
      }
    > = {
      [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: AwspKeyDefinition,
      [DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]: AwspTagDefinition,
      [DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS]: SpfPropertyDefinition,
      [DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS]:
        DriverPropertyDefinition,
      [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: AwspSpfModuleDefinition,
      [DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS]:
        DriverModuleDefinition,
      [DEFINITION_BLOCK_NAMES.VCPM_MODULE_DEFINITIONS]:
        AwspVcpmModuleDefinition,
      [DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS]: ProcessorDefinition,
      [DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES]: ContainerType,
    };

    const Hydrator = hydratorMap[blockName];
    if (!Hydrator) {
      throw new Error(`No hydrator found for definition block: ${blockName}`);
    }

    // Use fromParsed when available — data is already Zod-validated,
    // so re-parsing via fromJSON would apply preprocess coercions a second time.
    const hydrate = Hydrator.fromParsed ?? Hydrator.fromJSON;
    return data.map((item: unknown) =>
      hydrate.call(Hydrator, item),
    ) as DefinitionCollection;
  }

  /**
   * Parse the AWSP binary envelope from raw file bytes.
   *
   * Binary layout:
   *   [4]  Magic bytes "AWSP"
   *   [4]  Header length (uint32 little-endian)
   *   [N]  Header JSON (UTF-8) — version-probed and dispatched via HEADER_PARSERS
   *   [4]  Raw data length (uint32 little-endian)
   *   [M]  ZIP bytes (the payload passed to unzipBuffer)
   *
   * Throws AwspUnsupportedVersionError if the header version has no registered parser.
   */
  parseEnvelope(data: Uint8Array): {
    header: AwspFileHeader;
    zipData: Uint8Array;
  } {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    if (data.byteLength < BinaryUtils.SIZEOF_UINT32) {
      throw new Error('AWSP file too small to contain magic bytes');
    }
    const magic = new TextDecoder('ascii').decode(data.subarray(0, 4));
    if (magic !== AWSP_MAGIC) {
      throw new Error(
        `Invalid AWSP magic bytes: expected "${AWSP_MAGIC}", got "${magic}"`,
      );
    }
    offset += BinaryUtils.SIZEOF_UINT32;

    if (data.byteLength < offset + BinaryUtils.SIZEOF_UINT32) {
      throw new Error('AWSP file truncated: missing header length field');
    }
    const headerLength = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    if (data.byteLength < offset + headerLength) {
      throw new Error(
        `AWSP file truncated: header length ${headerLength} exceeds file size`,
      );
    }
    const headerJson = new TextDecoder('utf8').decode(
      data.subarray(offset, offset + headerLength),
    );
    offset += headerLength;

    const rawHeader: unknown = JSON.parse(headerJson);

    if (data.byteLength < offset + BinaryUtils.SIZEOF_UINT32) {
      throw new Error('AWSP file truncated: missing raw data length field');
    }
    const rawLength = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    if (data.byteLength < offset + rawLength) {
      throw new Error(
        `AWSP file truncated: raw data length ${rawLength} exceeds file size`,
      );
    }
    const zipData = data.subarray(offset, offset + rawLength);

    const header = parseAwspHeader(rawHeader);
    return {header, zipData};
  }

  /**
   * Parse all definitions from pre-parsed JSON data with parallel/sequential strategy
   * @param jsonData - Pre-parsed JSON object containing definition blocks
   * @returns Promise resolving to structured definitions (only includes blocks with data)
   */
  async parseDefinitions(
    jsonData: Record<string, JsonObject[]>,
  ): Promise<Record<string, DefinitionCollection>> {
    // Determine parsing strategy
    const useParallel = this.shouldUseParallelParsing();

    let parsedDefinitions: Record<string, DefinitionCollection>;

    // Step 1: Parse definitions using selected strategy
    try {
      if (useParallel && this.workerPool) {
        parsedDefinitions = await this.parseDefinitionsParallel(jsonData);
      } else {
        parsedDefinitions = this.parseDefinitionsSequential(jsonData);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Parsing failed: ${error.message}`);
      }
      throw new Error('Parsing failed: Unknown error');
    }

    return parsedDefinitions;
  }

  /**
   * Determine if parallel parsing should be used
   */
  private shouldUseParallelParsing(): boolean {
    // Use parallel processing if worker pool is available and threading is supported
    return (
      this.workerPool !== undefined && this.workerPool.isThreadingSupported()
    );
  }

  /**
   * Parse definitions using worker pool - SPF modules in one worker, others in another
   */
  private async parseDefinitionsParallel(
    jsonData: Record<string, JsonObject[]>,
  ): Promise<Record<string, DefinitionCollection>> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel parsing');
    }

    // Create two tasks: one for SPF modules, one for all others
    const tasks: WorkerTask<DefinitionParseInput>[] = [];

    // Task 1: SPF Module Definitions (separate worker)
    const spfModuleData =
      jsonData[DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS];
    if (
      spfModuleData &&
      Array.isArray(spfModuleData) &&
      spfModuleData.length > 0
    ) {
      tasks.push({
        handlerKey: HANDLER_KEYS.PARSE_DEFINITION,
        input: {
          definitionBlocks: {
            [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: spfModuleData,
          },
          taskName: 'SPF module definitions',
        },
      });
    }

    // Task 2: All other definitions (combined in one worker)
    const otherDefinitionBlocks: Record<string, JsonObject[]> = {};

    // Add each definition type if it has data
    const otherBlockNames = [
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES,
      DEFINITION_BLOCK_NAMES.VCPM_MODULE_DEFINITIONS,
    ];

    for (const blockName of otherBlockNames) {
      const blockData = jsonData[blockName];
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        otherDefinitionBlocks[blockName] = blockData;
      }
    }

    if (Object.keys(otherDefinitionBlocks).length > 0) {
      tasks.push({
        handlerKey: HANDLER_KEYS.PARSE_DEFINITION,
        input: {
          definitionBlocks: otherDefinitionBlocks,
          taskName: 'other definitions',
        },
      });
    }

    // Execute tasks in parallel
    const results = await this.workerPool.executeParallel<
      DefinitionParseInput,
      unknown,
      Record<string, DefinitionCollection>
    >(tasks);

    // Process results
    const parsedDefinitions: Record<string, DefinitionCollection> = {};

    for (const [i, result] of results.entries()) {
      const task = tasks[i];

      if (!result.success || result.error) {
        throw new Error(
          `Failed to parse ${task.input.taskName}: ${result.error}`,
        );
      }

      // Merge results from worker into final definitions object
      if (result.data) {
        Object.assign(parsedDefinitions, result.data);
      }
    }

    return parsedDefinitions;
  }

  /**
   * Parse definitions sequentially using the same static parse method as workers (optimized)
   */
  private parseDefinitionsSequential(
    jsonData: Record<string, JsonObject[]>,
  ): Record<string, DefinitionCollection> {
    // Collect all definition blocks that have data
    const definitionBlocks: Record<string, JsonObject[]> = {};

    const allBlockNames = [
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS,
      DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES,
      DEFINITION_BLOCK_NAMES.VCPM_MODULE_DEFINITIONS,
    ];

    for (const blockName of allBlockNames) {
      const blockData = jsonData[blockName];
      if (blockData && Array.isArray(blockData) && blockData.length > 0) {
        definitionBlocks[blockName] = blockData;
      }
    }

    // Use the same parsing logic as workers for consistency
    return AwspParser.parse({
      definitionBlocks,
      taskName: 'sequential parsing',
    });
  }
}
