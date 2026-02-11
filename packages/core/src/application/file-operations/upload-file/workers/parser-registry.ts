/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {HeaderChunkParser} from '../services/acdb-chunk-parsers/header-chunk-parser.js';
import {DatapoolChunkParser} from '../services/acdb-chunk-parsers/datapool-chunk-parser.js';
import type {ChunkParseContext} from '../models/chunk-parse-context.js';
import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import type {BaseChunkParser} from '../services/acdb-chunk-parsers/base-chunk-parser.js';
import type {
  ChunkParseInput,
  ChunkParseContextData,
} from '../types/chunk-parse.types.js';
import type {DefinitionParseInput} from '../services/awsp-parser.js';
import {AwspParser} from '../services/awsp-parser.js';
import type {
  KeyDefinitionBuildInput,
  KeyDefinitionBuildOutput,
} from '../services/entity-builders/key-definition-builder.js';
import {KeyDefinitionBuilder} from '../services/entity-builders/key-definition-builder.js';
import type {
  SpfModuleDefinitionBuildInput,
  SpfModuleDefinitionBuildOutput,
} from '../services/entity-builders/spf-module-definition-builder.js';
import {SpfModuleDefinitionBuilder} from '../services/entity-builders/spf-module-definition-builder.js';
import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import {CHUNK_TYPES} from '../../shared/constants/chunk-types.js';

/**
 * Creates default chunk parser factories.
 * These are the standard parsers used across the application.
 */
function createDefaultChunkParsers(): Map<string, BaseChunkParser> {
  return new Map<string, BaseChunkParser>([
    [CHUNK_TYPES.HEADER, new HeaderChunkParser()],
    [CHUNK_TYPES.DATAPOOL, new DatapoolChunkParser()],
    // Add more default parsers here as they are created
  ]);
}

/**
 * Creates a registry of chunk parsing handlers using factory pattern.
 * This is platform-agnostic and can be used in any worker implementation (Node.js, React Native, etc.).
 *
 * The registry maps handler keys to their corresponding functions, allowing workers
 * to execute business logic without knowing the implementation details.
 *
 * Uses built-in default parsers. No configuration needed.
 *
 * @returns Map of handler keys to handler functions
 */
export function createParserRegistry(): Map<string, Handler> {
  const registry = new Map<string, Handler>();

  // Always use default parsers
  const parsers = createDefaultChunkParsers();

  /**
   * Handler for parsing ACDB chunks.
   * Uses registered parser factories to parse chunks.
   */
  registry.set(HANDLER_KEYS.PARSE_CHUNK, ((
    input: ChunkParseInput,
    contextData?: ChunkParseContextData,
  ): BaseChunk => {
    // Get parser factory for this chunk type
    const parser = parsers.get(input.chunkType);

    if (!parser) {
      throw new Error(`Unknown chunk type: ${input.chunkType}`);
    }

    // Create context from contextData
    const context: ChunkParseContext = {
      rawChunks: contextData?.rawChunks,
      parsedChunks: contextData?.parsedChunks,
    };

    // Parse the chunk using the factory (context contains all raw data)
    return parser.parse(context);
  }) as Handler);

  /**
   * Handler for parsing AWSP definitions.
   * Uses AwspParser static method to parse definitions.
   */
  registry.set(HANDLER_KEYS.PARSE_DEFINITION, ((
    input: DefinitionParseInput,
  ): Record<string, unknown> => {
    // Use AwspParser static method for parsing
    return AwspParser.parse(input);
  }) as Handler);

  /**
   * Handler for building key definitions from AWSP data.
   * Uses KeyDefinitionBuilder static method to build key definitions.
   */
  registry.set(HANDLER_KEYS.BUILD_KEY_DEFINITIONS, ((
    input: KeyDefinitionBuildInput,
  ): KeyDefinitionBuildOutput => {
    // Use KeyDefinitionBuilder static method for building
    return KeyDefinitionBuilder.buildKeyDefinitions(input);
  }) as Handler);

  /**
   * Handler for building SPF module definitions from AWSP data.
   * Uses SpfModuleDefinitionBuilder static method to build SPF module definitions.
   */
  registry.set(HANDLER_KEYS.BUILD_SPF_MODULE_DEFINITIONS, ((
    input: SpfModuleDefinitionBuildInput,
  ): SpfModuleDefinitionBuildOutput => {
    // Use SpfModuleDefinitionBuilder static method for building
    return SpfModuleDefinitionBuilder.buildModuleDefinitions(input);
  }) as Handler);

  // Future handlers can be registered here
  // Example:
  // registry.set('validateChunk', (input, context) => { ... });

  return registry;
}

/**
 * Reconstruct a chunk instance from serialized data.
 * This is needed because chunks lose their class methods during serialization.
 *
 * @param chunkType - Type of chunk to reconstruct
 * @param data - Serialized chunk data
 * @returns Reconstructed chunk instance
 */
/*function reconstructChunk(chunkType: string, data: unknown): BaseChunk {
  let chunk: BaseChunk;

  switch (chunkType) {
    case CHUNK_TYPES.HEADER:
      chunk = new HeaderChunk();
      break;
    case CHUNK_TYPES.DATAPOOL:
      chunk = new DatapoolChunk();
      break;
    default:
      throw new Error(`Unknown chunk type: ${chunkType}`);
  }

  // Populate chunk with deserialized data
  Object.assign(chunk, data);
  return chunk;
}*/
