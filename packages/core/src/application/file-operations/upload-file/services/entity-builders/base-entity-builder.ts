import type {BaseChunk} from '../../../shared/acdb-chunks/base-chunk.js';

/**
 * Context provided to entity factories during creation
 */
export interface EntityBuilderContext {
  /** Map of parsed chunks available for entity creation */
  chunks: Map<string, BaseChunk>;
}

/**
 * Abstract base class for entity factories.
 * Each factory knows how to create a specific domain entity from chunks.
 */
export abstract class BaseEntityBuilder<T> {
  /** Unique identifier for the entity type this factory creates */
  abstract readonly entityType: string;

  /** Array of chunk types required to create this entity */
  abstract readonly requiredChunks: string[];

  /**
   * Hint for optimization: simple entities can be created directly without workers
   * Simple = single chunk, no complex relationships
   */
  abstract readonly isSimple: boolean;

  /**
   * Create entity from chunks
   */
  abstract create(context: EntityBuilderContext): T;

  /**
   * Extract only the required data for this entity (for worker transfer).
   * Returns a plain object with only primitives for fast serialization.
   */
  abstract extractRequiredData(context: EntityBuilderContext): any;

  /**
   * Create entity from extracted data (used in worker).
   * This method receives the plain object from extractRequiredData.
   */
  abstract createFromData(data: any): T;
}
