/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHUNK_TYPES,
  type ChunkType,
} from '../../shared/constants/chunk-types.js';

/**
 * Represents a dependency with its type specification
 */
export interface ChunkDependency {
  /** The chunk type this depends on */
  chunkType: ChunkType;
  /** Whether this dependency needs raw binary data or parsed chunk object */
  dependencyType: 'raw' | 'parsed';
}

/**
 * Metadata for ACDB chunk types.
 * Defines dependencies and descriptions for each chunk type.
 */
export interface ChunkTypeMetadata {
  /** Chunk type identifier */
  type: ChunkType;
  /** List of chunk dependencies with their types */
  dependencies: ChunkDependency[];
  /** Human-readable description of the chunk */
  description: string;
}

/**
 * Static registry of chunk type metadata.
 * Provides centralized metadata for all ACDB chunk types without needing
 * to instantiate chunk objects.
 *
 * Benefits:
 * - No dummy chunk creation needed
 * - Centralized metadata management
 * - Easy to extend with new chunk types
 * - Type-safe at compile time
 */
export class ChunkMetadataRegistry {
  private static metadata: ChunkTypeMetadata[] = [
    {
      type: CHUNK_TYPES.HEADER,
      dependencies: [],
      description: 'File header with version and metadata',
    },
    {
      type: CHUNK_TYPES.DATAPOOL,
      dependencies: [],
      description: 'Datapool chunk',
    },
    {
      type: CHUNK_TYPES.GKV_TABLE,
      dependencies: [
        {chunkType: CHUNK_TYPES.GKV_LUT, dependencyType: 'raw'},
        {chunkType: CHUNK_TYPES.DATAPOOL, dependencyType: 'parsed'},
      ],
      description: 'Usecase data with GKV table and lookup functionality',
    },
    {
      type: CHUNK_TYPES.SUBGRAPH_DATA,
      dependencies: [
        {chunkType: CHUNK_TYPES.GKV_TABLE, dependencyType: 'parsed'},
        {chunkType: CHUNK_TYPES.DATAPOOL, dependencyType: 'parsed'},
      ],
      description:
        'Derived subgraph data extracted from usecase entries and datapool',
    },
    {
      type: CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
      dependencies: [
        {chunkType: CHUNK_TYPES.SUBGRAPH_CONNECTION_DEF, dependencyType: 'raw'},
        {chunkType: CHUNK_TYPES.SUBGRAPH_CONNECTION_DOT, dependencyType: 'raw'},
        {chunkType: CHUNK_TYPES.DATAPOOL, dependencyType: 'parsed'},
      ],
      description:
        'Subgraph connection pairs with data and control links between subgraphs',
    },
    // Add more chunk types as they are implemented
  ];

  /**
   * Get metadata for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Chunk metadata if found, undefined otherwise
   */
  static getMetadata(chunkType: string): ChunkTypeMetadata | undefined {
    return this.metadata.find(meta => meta.type === chunkType);
  }

  /**
   * Get dependencies for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Array of chunk types this chunk depends on
   */
  static getDependencies(chunkType: string): ChunkType[] {
    const meta = this.metadata.find(meta => meta.type === chunkType);
    return meta?.dependencies.map(dep => dep.chunkType) || [];
  }

  /**
   * Get raw dependencies for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Array of chunk types that need raw binary data
   */
  static getRawDependencies(chunkType: string): ChunkType[] {
    const meta = this.metadata.find(meta => meta.type === chunkType);
    return (
      meta?.dependencies
        .filter(dep => dep.dependencyType === 'raw')
        .map(dep => dep.chunkType) || []
    );
  }

  /**
   * Get parsed dependencies for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Array of chunk types that need parsed chunk objects
   */
  static getParsedDependencies(chunkType: string): ChunkType[] {
    const meta = this.metadata.find(meta => meta.type === chunkType);
    return (
      meta?.dependencies
        .filter(dep => dep.dependencyType === 'parsed')
        .map(dep => dep.chunkType) || []
    );
  }

  /**
   * Get all dependency information for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Array of chunk dependencies with their types
   */
  static getDependencyInfo(chunkType: string): ChunkDependency[] {
    const meta = this.metadata.find(meta => meta.type === chunkType);
    return meta?.dependencies || [];
  }

  /**
   * Get all registered chunk types
   * @returns Array of all chunk type identifiers
   */
  static getAllChunkTypes(): ChunkType[] {
    return this.metadata.map(meta => meta.type);
  }

  /**
   * Register a new chunk type (for extensibility)
   * @param metadata - Metadata for the new chunk type
   */
  static registerChunkType(metadata: ChunkTypeMetadata): void {
    const existingIndex = this.metadata.findIndex(
      meta => meta.type === metadata.type,
    );
    if (existingIndex === -1) {
      this.metadata.push(metadata);
    } else {
      this.metadata[existingIndex] = metadata;
    }
  }

  /**
   * Check if a chunk type is registered
   * @param chunkType - The chunk type identifier
   * @returns true if chunk type is registered, false otherwise
   */
  static hasChunkType(chunkType: string): boolean {
    return this.metadata.some(meta => meta.type === chunkType);
  }

  /**
   * Check if a chunk type is known (either as a main chunk or dependency)
   * @param chunkType - The chunk type identifier
   * @returns true if chunk type is registered or referenced as a dependency
   */
  static isKnownChunkType(chunkType: string): boolean {
    // Check if it's a main registered chunk
    if (this.hasChunkType(chunkType)) {
      return true;
    }

    // Check if it's referenced as a dependency
    return this.metadata.some(meta =>
      meta.dependencies.some(dep => dep.chunkType === chunkType),
    );
  }

  /**
   * Get description for a chunk type
   * @param chunkType - The chunk type identifier
   * @returns Description if found, undefined otherwise
   */
  static getDescription(chunkType: string): string | undefined {
    return this.metadata.find(meta => meta.type === chunkType)?.description;
  }
}
