import {ParsedAcdb} from '../models/parsed-acdb.js';
import type {ChunkMetadata} from '../models/chunk-metadata.js';
import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import type {ChunkParseContext} from '../models/chunk-parse-context.js';
import {AcdbParser} from './acdb-parser.js';
//import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
//import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
// import type {
//   ChunkParseInput,
//   ChunkParseContextData,
// } from '../../types/chunk-parse.types.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {ChunkMetadataRegistry} from './chunk-metadata-registry.js';
import type {FileReaderPort} from '../../../ports/file-system/file-reader.port.js';
import type {PathRef} from '../../shared/utils/file-ref.js';
//import {HANDLER_KEYS} from '../../constants/registry-keys.js';
//import {CHUNK_TYPES} from '../../constants/chunk-types.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import {AcdbFileInfo} from '../models/acdb-file-info.js';

/**
 * Orchestrator for ACDB file parsing.
 * Manages parallel vs sequential parsing strategy and coordinates chunk parsing workflow.
 */
export class AcdbFileOrchestrator {
  private readonly chunkParser: AcdbParser;

  constructor(
    private readonly fileReader: FileReaderPort,
    //private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {
    this.chunkParser = new AcdbParser();
  }

  /**
   * Parse ACDB file structure and extract file metadata and chunk descriptors.
   */
  parseAcdbFile(bytes: Uint8Array): AcdbFileInfo {
    if (bytes.length < 12) {
      throw new Error('Invalid ACDB file: too small to contain header');
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;

    // Read and validate file ID
    const fileId = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    const expectedFileId = BinaryUtils.stringToUint32('ACDB');
    if (fileId !== expectedFileId) {
      throw new Error(
        `Invalid file format: expected ACDB file ID, got: ${BinaryUtils.uint32ToString(fileId)}`,
      );
    }

    // Read file type
    const fileType = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Read file length
    const fileLength = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Parse chunks sequentially
    const chunks: ChunkMetadata[] = [];

    while (offset < fileLength && offset < bytes.length) {
      if (offset + 2 * BinaryUtils.SIZEOF_UINT32 > bytes.length) {
        throw new Error(
          `Invalid ACDB file: incomplete chunk header at offset ${offset}`,
        );
      }

      // Read chunk ID
      const chunkId = BinaryUtils.readUint32(view, offset);
      offset += BinaryUtils.SIZEOF_UINT32;

      // Read chunk length
      const chunkLen = BinaryUtils.readUint32(view, offset);
      offset += BinaryUtils.SIZEOF_UINT32;

      // Convert chunk ID to string type
      const chunkType = BinaryUtils.uint32ToString(chunkId);

      // Validate chunk length
      if (offset + chunkLen > bytes.length) {
        throw new Error(
          `Invalid ACDB file: chunk ${chunkType} extends beyond file boundary`,
        );
      }

      // Create chunk descriptor
      chunks.push({
        type: chunkType,
        offset: offset, // Data starts after ID and length
        length: chunkLen,
      });

      // Skip chunk data
      offset += chunkLen;
    }

    return new AcdbFileInfo(fileId, fileType, fileLength, chunks);
  }

  /**
   * Parse an ACDB file from raw bytes
   */
  async parseACDB(acdbRef: PathRef): Promise<ParsedAcdb> {
    const startTime = Date.now();

    // Read files
    var bytes = await this.fileReader.readAll(acdbRef);

    this.logger?.logInfo({
      msg: 'ACDB parsing started',
      action: 'parse_acdb_start',
      component: 'AcdbFileOrchestrator',
      tag: 'parsing',
      timestamp: new Date(),
    });

    try {
      // 1. Basic file validation
      if (bytes.length < 16) {
        throw new Error(`File too small: ${bytes.length} bytes (minimum 16)`);
      }

      // 2. Parse ACDB file structure and extract metadata
      const fileInfo = this.parseAcdbFile(bytes);

      // 3. Use extracted chunk descriptors
      const chunkDescriptors = fileInfo.chunks;

      // 4. Basic chunk validation
      if (chunkDescriptors.length === 0) {
        throw new Error('No chunks found in file');
      }

      // 5. Validate chunk dependencies
      this.validateChunkDependencies(chunkDescriptors);

      // 6. Determine parsing strategy
      //const useParallel = this.shouldUseParallelParsing(chunkDescriptors);

      // 6. Execute parsing based on strategy
      const result = await this.parseChunks(
        bytes,
        chunkDescriptors,
        //useParallel,
      );

      // 7. Store file type in result
      result.fileType = fileInfo.fileType;

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: `ACDB parsing completed in ${duration}ms`,
        action: 'parse_acdb_complete',
        component: 'AcdbFileOrchestrator',
        tag: 'parsing',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'ACDB parsing failed',
        action: 'parse_acdb_failed',
        component: 'AcdbFileOrchestrator',
        tag: 'parsing',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Determine if parallel parsing should be used
   * NOTE: Parallel processing is temporarily disabled - using sequential parsing only
   */
  //private shouldUseParallelParsing(descriptors: ChunkMetadata[]): boolean {
  // TODO: Re-enable parallel processing once worker issues are resolved
  //  return false;

  // Original parallel processing logic (commented out):
  // return (
  //   this.workerPool !== undefined &&
  //   this.workerPool.isThreadingSupported() &&
  //   descriptors.length > 1
  // );
  //}

  /**
   * Parse all chunks in registry order (unified approach)
   * Handles both binary chunks (from file) and derived chunks (computed) in correct dependency order
   */
  private async parseChunks(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    //useParallel: boolean,
  ): Promise<ParsedAcdb> {
    const result = new ParsedAcdb();
    const parsedChunks = new Map<string, BaseChunk>();

    // Get all registered chunk types in registry order (priority already set)
    const allRegisteredChunks = ChunkMetadataRegistry.getAllChunkTypes();

    // NOTE: Parallel processing is temporarily disabled - using sequential parsing only
    // TODO: Re-enable parallel processing once worker issues are resolved

    await this.parseAllChunksSequential(
      bytes,
      descriptors,
      allRegisteredChunks,
      parsedChunks,
      result,
    );

    return result;
  }

  /**
   * Parse all chunks sequentially in registry order
   */
  private async parseAllChunksSequential(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    allRegisteredChunks: string[],
    parsedChunks: Map<string, BaseChunk>,
    result: ParsedAcdb,
  ): Promise<void> {
    // Process all registered chunks in registry order (priority already set)
    for (const chunkType of allRegisteredChunks) {
      // Build context based on chunk type and dependencies
      const context = this.buildOptimizedContext(
        chunkType,
        parsedChunks,
        bytes,
        descriptors,
      );

      try {
        // Parse the chunk (works for both binary and derived chunks)
        const chunk = this.chunkParser.parseChunk(chunkType, context);
        parsedChunks.set(chunkType, chunk);
        result.addChunk(chunkType, chunk);

        this.logger?.logInfo({
          msg: `Successfully parsed chunk: ${chunkType}`,
          action: 'parse_chunk_success',
          component: 'AcdbFileOrchestrator',
          tag: 'parsing',
          timestamp: new Date(),
        });
      } catch (error) {
        this.logger?.logError({
          msg: `Failed to parse chunk: ${chunkType}`,
          action: 'parse_chunk_failed',
          component: 'AcdbFileOrchestrator',
          tag: 'parsing',
          error: error as Error,
          timestamp: new Date(),
        });
        throw error;
      }
    }
  }

  /**
   * Parse chunks in parallel using workers - independent chunks first, then dependent chunks
   * NOTE: Temporarily disabled - parallel processing is not working correctly
   * TODO: Re-enable once worker issues are resolved
   */
  // private async parseChunkBatchParallel(
  //   bytes: Uint8Array,
  //   allDescriptors: ChunkMetadata[],
  //   independentChunkTypes: string[],
  //   dependentChunkTypes: string[],
  //   parsedChunks: Map<string, BaseChunk>,
  //   result: ParsedAcdb,
  // ): Promise<void> {
  //   if (!this.workerPool) {
  //     throw new Error('Worker pool not available for parallel parsing');
  //   }

  //   // Parse independent chunks first (in parallel)
  //   if (independentChunkTypes.length > 0) {
  //     const independentResults = await this.parseChunkGroup(
  //       bytes,
  //       allDescriptors,
  //       independentChunkTypes,
  //       undefined, // No datapool yet
  //       result,
  //     );
  //     // Add independent chunks to parsedChunks
  //     for (const [type, chunk] of independentResults) {
  //       parsedChunks.set(type, chunk);
  //     }
  //   }

  //   // Parse dependent chunks (in parallel, but after independent chunks are done)
  //   if (dependentChunkTypes.length > 0) {
  //     const datapoolChunk = parsedChunks.get(CHUNK_TYPES.DATAPOOL);
  //     const dependentResults = await this.parseChunkGroup(
  //       bytes,
  //       allDescriptors,
  //       dependentChunkTypes,
  //       datapoolChunk,
  //       result,
  //     );
  //     // Add dependent chunks to parsedChunks
  //     for (const [type, chunk] of dependentResults) {
  //       parsedChunks.set(type, chunk);
  //     }
  //   }
  // }

  /**
   * Parse a group of chunks in parallel
   * NOTE: Temporarily disabled - parallel processing is not working correctly
   * TODO: Re-enable once worker issues are resolved
   */
  // private async parseChunkGroup(
  //   bytes: Uint8Array,
  //   allDescriptors: ChunkMetadata[],
  //   chunkTypesToParse: string[],
  //   datapoolChunk: BaseChunk | undefined,
  //   result: ParsedAcdb,
  // ): Promise<Map<string, BaseChunk>> {
  //   // Create tasks for chunk group
  //   const tasks: WorkerTask<ChunkParseInput, ChunkParseContextData>[] =
  //     chunkTypesToParse.map(chunkType =>
  //       this.createChunkTask(chunkType, allDescriptors, bytes, datapoolChunk),
  //     );

  //   // Execute in parallel
  //   const results = await this.workerPool!.executeParallel<
  //     ChunkParseInput,
  //     ChunkParseContextData,
  //     BaseChunk
  //   >(tasks);

  //   // Process results and return parsed chunks
  //   const parsedChunks = new Map<string, BaseChunk>();
  //   for (let i = 0; i < results.length; i++) {
  //     const taskResult = results[i];
  //     const chunkType = chunkTypesToParse[i];

  //     if (!taskResult.success || taskResult.error) {
  //       throw new Error(`Failed to parse ${chunkType}: ${taskResult.error}`);
  //     }

  //     const chunk = taskResult.data as BaseChunk;
  //     parsedChunks.set(chunkType, chunk);
  //     result.addChunk(chunkType, chunk);
  //   }

  //   return parsedChunks;
  // }

  /**
   * Create a worker task for parsing a chunk with chunk group
   * NOTE: Temporarily disabled - parallel processing is not working correctly
   * TODO: Re-enable once worker issues are resolved
   */
  // private createChunkTask(
  //   chunkType: string,
  //   allDescriptors: ChunkMetadata[],
  //   bytes: Uint8Array,
  //   datapoolChunk?: BaseChunk,
  // ): WorkerTask<ChunkParseInput, ChunkParseContextData> {
  //   const descriptor = allDescriptors.find(d => d.type === chunkType);
  //   if (!descriptor) {
  //     throw new Error(`Chunk descriptor not found for type: ${chunkType}`);
  //   }

  //   const dependencies = ChunkMetadataRegistry.getDependencies(chunkType);

  //   // Build chunk group: main chunk + all dependencies
  //   const chunkGroup = [chunkType, ...dependencies].map(type => {
  //     const chunkDescriptor = allDescriptors.find(d => d.type === type);
  //     if (!chunkDescriptor) {
  //       throw new Error(`Chunk descriptor not found for type: ${type}`);
  //     }
  //     return {
  //       chunkType: type,
  //       chunkData: this.extractChunkData(bytes, chunkDescriptor),
  //     };
  //   });

  //   return {
  //     handlerKey: HANDLER_KEYS.PARSE_CHUNK,
  //     input: {
  //       chunkType: chunkType,
  //       chunkGroup: chunkGroup,
  //     },
  //     context: {
  //       datapool: datapoolChunk ? structuredClone(datapoolChunk) : undefined,
  //     },
  //   };
  // }

  /**
   * Build optimized context for a specific chunk based on its dependencies
   */
  private buildOptimizedContext(
    chunkType: string,
    parsedChunks: Map<string, BaseChunk>,
    bytes: Uint8Array,
    allDescriptors: ChunkMetadata[],
  ): ChunkParseContext {
    const rawDeps = ChunkMetadataRegistry.getRawDependencies(chunkType);
    const parsedDeps = ChunkMetadataRegistry.getParsedDependencies(chunkType);

    const context: ChunkParseContext = {};

    // Always initialize rawChunks to include the main chunk data
    context.rawChunks = new Map();

    // Add the main chunk data first
    const mainDescriptor = allDescriptors.find(d => d.type === chunkType);
    if (mainDescriptor) {
      const mainChunkData = this.extractChunkData(bytes, mainDescriptor);
      context.rawChunks.set(chunkType, mainChunkData);
    }

    // Add raw dependencies with actual binary data (only what's needed for this chunk)
    for (const depType of rawDeps) {
      // Find the descriptor for this raw dependency
      const descriptor = allDescriptors.find(d => d.type === depType);
      if (descriptor) {
        // Extract the raw chunk data using existing extractChunkData method
        const rawChunkData = this.extractChunkData(bytes, descriptor);
        context.rawChunks.set(depType, rawChunkData);
      }
    }

    // Add parsed dependencies (only what's needed for this chunk)
    if (parsedDeps.length > 0) {
      context.parsedChunks = new Map();

      for (const depType of parsedDeps) {
        const parsedChunk = parsedChunks.get(depType);
        if (parsedChunk) {
          context.parsedChunks.set(depType, parsedChunk);
        }
      }
    }

    return context;
  }

  /**
   * Extract chunk data from file bytes
   */
  private extractChunkData(
    bytes: Uint8Array,
    descriptor: ChunkMetadata,
  ): Uint8Array {
    return bytes.slice(
      descriptor.offset,
      descriptor.offset + descriptor.length,
    );
  }

  /**
   * Validate chunk dependencies before parsing.
   * Only validates chunks that are present in the file (binary chunks).
   * Derived chunks are validated during parsing when their dependencies are checked.
   */
  private validateChunkDependencies(descriptors: ChunkMetadata[]): void {
    const availableChunks = new Set(descriptors.map(d => d.type));

    // Only validate chunks that are actually in the file
    for (const descriptor of descriptors) {
      const deps = ChunkMetadataRegistry.getDependencies(descriptor.type);

      for (const dep of deps) {
        if (!availableChunks.has(dep)) {
          throw new Error(
            `Chunk ${descriptor.type} requires ${dep} but it's not present in file`,
          );
        }
      }
    }
  }
}
