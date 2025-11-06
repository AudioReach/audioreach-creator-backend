import {ParsedAcdb} from './models/parsed-acdb.js';
import type {ChunkMetadata} from './models/chunk-metadata.js';
import type {BaseChunk} from './chunks/base-chunk.js';
import type {ChunkParseContext} from './models/chunk-parse-context.js';
import {AcdbChunkParser} from './acdb-chunk-parser.js';
import type {WorkerPoolPort} from '../../../../ports/worker/worker-pool.port.js';
import type {WorkerTask} from '../../../../ports/worker/worker-types.js';
import type {
  ChunkParseInput,
  ChunkParseContextData,
} from '../../types/chunk-parse.types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {ChunkMetadataRegistry} from './chunks/chunk-metadata-registry.js';
import {AcdbFileValidator} from '../../validators/acdb-file.validator.js';
import type {FileReaderPort} from '../../ports/file-reader.port.js';
import type {PathRef} from '../../utils/file-ref.js';
import {HANDLER_KEYS} from '../../constants/registry-keys.js';

/**
 * Orchestrator for ACDB file parsing.
 * Manages parallel vs sequential parsing strategy and coordinates chunk parsing workflow.
 */
export class AcdbParser {
  private readonly chunkParser: AcdbChunkParser;

  constructor(
    private readonly fileReader: FileReaderPort,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {
    this.chunkParser = new AcdbChunkParser();
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
      component: 'AcdbParser',
      tag: 'parsing',
      timestamp: new Date(),
    });

    try {
      // 1. Validate file structure
      AcdbFileValidator.validate(bytes);

      // 2. Extract chunk metadata from file
      const chunkDescriptors = this.chunkParser.extractChunkData(bytes);

      // 3. Validate chunk descriptors
      AcdbFileValidator.validateChunkDescriptors(
        chunkDescriptors,
        bytes.length,
      );

      // 4. Validate chunk dependencies
      this.validateChunkDependencies(chunkDescriptors);

      // 5. Determine parsing strategy
      const useParallel = this.shouldUseParallelParsing(chunkDescriptors);

      this.logger?.logDebug({
        msg: `Using ${useParallel ? 'parallel' : 'sequential'} parsing for ${chunkDescriptors.length} chunks`,
        action: 'parse_strategy_selected',
        component: 'AcdbParser',
        tag: 'parsing',
        timestamp: new Date(),
      });

      // 6. Execute parsing based on strategy
      const result = useParallel
        ? await this.parseParallel(bytes, chunkDescriptors)
        : await this.parseSequential(bytes, chunkDescriptors);

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: `ACDB parsing completed in ${duration}ms`,
        action: 'parse_acdb_complete',
        component: 'AcdbParser',
        tag: 'parsing',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'ACDB parsing failed',
        action: 'parse_acdb_failed',
        component: 'AcdbParser',
        tag: 'parsing',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Determine if parallel parsing should be used
   */
  private shouldUseParallelParsing(descriptors: ChunkMetadata[]): boolean {
    return (
      this.workerPool !== undefined &&
      this.workerPool.isThreadingSupported() &&
      descriptors.length > 1
    );
  }

  /**
   * Parse chunks sequentially (fallback or single-threaded)
   */
  private async parseSequential(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
  ): Promise<ParsedAcdb> {
    return this.parseChunks(bytes, descriptors, false);
  }

  /**
   * Parse chunks in parallel using worker pool
   */
  private async parseParallel(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
  ): Promise<ParsedAcdb> {
    return this.parseChunks(bytes, descriptors, true);
  }

  /**
   * Core parsing logic - works for both sequential and parallel modes
   * Optimized: Parse common chunks first, then independent chunks
   */
  private async parseChunks(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    useParallel: boolean,
  ): Promise<ParsedAcdb> {
    const result = new ParsedAcdb();
    const parsedChunks = new Map<string, BaseChunk>();

    // Step 1: Separate common and independent chunks
    const {common, independent} = this.separateChunks(descriptors);

    this.logger?.logDebug({
      msg: `Identified ${common.length} common chunks, ${independent.length} independent chunks`,
      action: 'parse_strategy_identified',
      component: 'AcdbParser',
      tag: 'parsing',
      timestamp: new Date(),
    });

    // Step 2: Parse common chunks (parallel or sequential based on mode)
    if (common.length > 0) {
      await this.parseChunkBatch(
        bytes,
        common,
        parsedChunks,
        result,
        useParallel,
        'common',
      );
    }

    // Step 3: Parse independent chunks (parallel or sequential based on mode)
    if (independent.length > 0) {
      await this.parseChunkBatch(
        bytes,
        independent,
        parsedChunks,
        result,
        useParallel,
        'independent',
      );
    }

    return result;
  }

  /**
   * Parse a batch of chunks (sequential or parallel)
   */
  private async parseChunkBatch(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    parsedChunks: Map<string, BaseChunk>,
    result: ParsedAcdb,
    useParallel: boolean,
    batchType: 'common' | 'independent',
  ): Promise<void> {
    const mode = useParallel ? 'parallel' : 'sequential';

    this.logger?.logDebug({
      msg: `Parsing ${descriptors.length} ${batchType} chunks ${mode}ly`,
      action: `parse_${batchType}_start`,
      component: 'AcdbParser',
      tag: 'parsing',
      timestamp: new Date(),
    });

    if (useParallel && this.workerPool) {
      await this.parseChunkBatchParallel(
        bytes,
        descriptors,
        parsedChunks,
        result,
      );
    } else {
      await this.parseChunkBatchSequential(
        bytes,
        descriptors,
        parsedChunks,
        result,
      );
    }
  }

  /**
   * Parse chunks sequentially
   */
  private async parseChunkBatchSequential(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    parsedChunks: Map<string, BaseChunk>,
    result: ParsedAcdb,
  ): Promise<void> {
    for (const descriptor of descriptors) {
      const chunk = await this.parseSingleChunk(
        bytes,
        descriptor,
        parsedChunks,
      );
      parsedChunks.set(descriptor.type, chunk);
      result.addChunk(descriptor.type, chunk);
    }
  }

  /**
   * Parse chunks in parallel using workers
   */
  private async parseChunkBatchParallel(
    bytes: Uint8Array,
    descriptors: ChunkMetadata[],
    parsedChunks: Map<string, BaseChunk>,
    result: ParsedAcdb,
  ): Promise<void> {
    if (!this.workerPool) {
      throw new Error('Worker pool not available for parallel parsing');
    }

    // Serialize dependencies once for all workers
    const serializedDeps = this.serializeDependencies(parsedChunks);

    // Create tasks for workers (handlerKey is registered in parser-registry.ts)
    const tasks: WorkerTask<ChunkParseInput, ChunkParseContextData>[] =
      descriptors.map(descriptor => ({
        handlerKey: HANDLER_KEYS.PARSE_CHUNK,
        input: {
          chunkType: descriptor.type,
          chunkData: this.extractChunkData(bytes, descriptor),
        },
        context: {dependencies: serializedDeps},
      }));

    // Execute in parallel
    const results = await this.workerPool.executeParallel<
      ChunkParseInput,
      ChunkParseContextData,
      BaseChunk
    >(tasks);

    // Process results
    for (let i = 0; i < results.length; i++) {
      const taskResult = results[i];
      const descriptor = descriptors[i];

      if (!taskResult.success || taskResult.error) {
        throw new Error(
          `Failed to parse ${descriptor.type}: ${taskResult.error}`,
        );
      }

      const chunk = taskResult.data as BaseChunk;
      parsedChunks.set(descriptor.type, chunk);
      result.addChunk(descriptor.type, chunk);
    }
  }

  /**
   * Parse a single chunk with error handling
   */
  private async parseSingleChunk(
    bytes: Uint8Array,
    descriptor: ChunkMetadata,
    dependencies: Map<string, BaseChunk>,
  ): Promise<BaseChunk> {
    const chunkData = this.extractChunkData(bytes, descriptor);
    const context: ChunkParseContext = {dependencies};

    try {
      return this.chunkParser.parseChunk(descriptor.type, chunkData, context);
    } catch (error) {
      this.logger?.logError({
        msg: `Failed to parse chunk: ${descriptor.type}`,
        action: 'parse_chunk_failed',
        component: 'AcdbParser',
        tag: 'parsing',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Separate chunks into common and independent using static metadata
   */
  private separateChunks(descriptors: ChunkMetadata[]): {
    common: ChunkMetadata[];
    independent: ChunkMetadata[];
  } {
    const common: ChunkMetadata[] = [];
    const independent: ChunkMetadata[] = [];

    for (const descriptor of descriptors) {
      if (ChunkMetadataRegistry.isCommonChunk(descriptor.type)) {
        common.push(descriptor);
      } else {
        independent.push(descriptor);
      }
    }

    return {common, independent};
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
   * Serialize dependencies for worker transfer
   */
  private serializeDependencies(
    parsedChunks: Map<string, BaseChunk>,
  ): Record<string, unknown> {
    const dependencies: Record<string, unknown> = {};

    for (const [type, chunk] of parsedChunks.entries()) {
      // Use structuredClone to preserve types (Uint8Array, etc.)
      dependencies[type] = structuredClone(chunk);
    }

    return dependencies;
  }

  /**
   * Validate chunk dependencies before parsing.
   * Ensures all required dependencies are present in the file.
   */
  private validateChunkDependencies(descriptors: ChunkMetadata[]): void {
    const availableChunks = new Set(descriptors.map(d => d.type));

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
