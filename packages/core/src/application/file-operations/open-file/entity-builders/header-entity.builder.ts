import {HeaderEntity} from '../../../../domain/entities/common/entities/header.entity.js';
import {HeaderChunk} from '../services/parsers/chunks/header-chunk.js';
import {
  BaseEntityBuilder,
  type EntityBuilderContext,
} from './base-entity-builder.js';

/**
 * Data transfer object for HeaderEntity creation
 */
export interface HeaderEntityData {
  version: string;
  fileSize: number;
  chunkCount: number;
}

/**
 * Builder for creating HeaderEntity from HeaderChunk
 */
export class HeaderEntityBuilder extends BaseEntityBuilder<HeaderEntity> {
  readonly entityType = 'HEADER_ENTITY';
  readonly requiredChunks = ['HEADER'];
  readonly isSimple = true; // Simple entity, prefer direct creation

  create(context: EntityBuilderContext): HeaderEntity {
    const headerChunk = context.chunks.get('HEADER') as HeaderChunk;

    if (!headerChunk) {
      throw new Error('HEADER chunk is required for HeaderEntity');
    }

    // Validate chunk has required data
    if (
      !headerChunk.version ||
      !headerChunk.fileSize ||
      !headerChunk.chunkCount
    ) {
      throw new Error('HEADER chunk is missing required fields');
    }

    // Transform chunk data into entity
    return new HeaderEntity(
      headerChunk.version,
      headerChunk.fileSize,
      headerChunk.chunkCount,
    );
  }

  extractRequiredData(context: EntityBuilderContext): HeaderEntityData {
    const headerChunk = context.chunks.get('HEADER') as HeaderChunk;

    if (!headerChunk) {
      throw new Error('HEADER chunk is required for HeaderEntity');
    }

    // Extract only primitives for fast transfer
    return {
      version: headerChunk.version!,
      fileSize: headerChunk.fileSize!,
      chunkCount: headerChunk.chunkCount!,
    };
  }

  createFromData(data: HeaderEntityData): HeaderEntity {
    return new HeaderEntity(data.version, data.fileSize, data.chunkCount);
  }
}
