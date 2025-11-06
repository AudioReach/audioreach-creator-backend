import {HeaderChunkParser} from '../services/parsers/header-chunk-parser.js';
import {HeaderChunk} from '../services/parsers/chunks/header-chunk.js';
import type {ChunkParseContext} from '../services/parsers/models/chunk-parse-context.js';
import type {BaseChunk} from '../services/parsers/chunks/base-chunk.js';
import type {BaseChunkParser} from '../services/parsers/base-chunk-parser.js';
import type {
  ChunkParseInput,
  ChunkParseContextData,
} from '../types/chunk-parse.types.js';
import type {Handler} from '../../../ports/worker/handler-registry.port.js';
import {CHUNK_PARSER_KEYS, HANDLER_KEYS} from '../constants/registry-keys.js';

/**
 * Creates default chunk parser factories.
 * These are the standard parsers used across the application.
 */
function createDefaultChunkParsers(): Map<string, BaseChunkParser> {
  return new Map<string, BaseChunkParser>([
    [CHUNK_PARSER_KEYS.HEADER, new HeaderChunkParser()],
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

    // Reconstruct dependencies map from serialized data
    const dependencies = new Map<string, BaseChunk>();

    if (contextData?.dependencies) {
      for (const [depType, depData] of Object.entries(
        contextData.dependencies,
      )) {
        // Reconstruct chunk instance from serialized data
        const depChunk = reconstructChunk(depType, depData);
        dependencies.set(depType, depChunk);
      }
    }

    // Create context for chunk parser
    const context: ChunkParseContext = {dependencies};

    // Parse the chunk using the factory
    return parser.parse(input.chunkData, context);
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
function reconstructChunk(chunkType: string, data: unknown): BaseChunk {
  let chunk: BaseChunk;

  switch (chunkType) {
    case CHUNK_PARSER_KEYS.HEADER:
      chunk = new HeaderChunk();
      break;
    default:
      throw new Error(`Unknown chunk type: ${chunkType}`);
  }

  // Populate chunk with deserialized data
  Object.assign(chunk, data);
  return chunk;
}
