import {HeaderEntity} from '../../../../../domain/entities/common/entities/header.entity.js';
import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import {
  HeaderChunk,
  type ACDBVersionInfo,
  type CodecInfo,
} from '../../../shared/acdb-chunks/header-chunk.js';
import {
  BaseEntityBuilder,
  type EntityBuilderContext,
} from './base-entity-builder.js';

/**
 * Data transfer object for HeaderEntity creation
 */
export interface HeaderEntityData {
  headerVersion: number;
  version: ACDBVersionInfo;
  codecInfos: CodecInfo[];
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Builder for creating HeaderEntity from HeaderChunk
 */
export class HeaderEntityBuilder extends BaseEntityBuilder<HeaderEntity> {
  readonly entityType = 'HEADER_ENTITY';
  readonly requiredChunks = [CHUNK_TYPES.HEADER];
  readonly isSimple = true; // Simple entity, prefer direct creation

  create(context: EntityBuilderContext): HeaderEntity {
    const headerChunk = context.chunks.get(CHUNK_TYPES.HEADER) as HeaderChunk;

    if (!headerChunk) {
      throw new Error('HEADER chunk is required for HeaderEntity');
    }

    // Validate chunk has required data
    if (
      headerChunk.headerVersion == null ||
      !headerChunk.version ||
      !headerChunk.codecInfos ||
      headerChunk.modifiedDate == null ||
      headerChunk.oemInfo == null
    ) {
      throw new Error('HEADER chunk is missing required fields');
    }

    // Transform chunk data into entity
    return new HeaderEntity(
      headerChunk.headerVersion,
      headerChunk.version,
      headerChunk.codecInfos,
      headerChunk.modifiedDate,
      headerChunk.oemInfo,
    );
  }

  extractRequiredData(context: EntityBuilderContext): HeaderEntityData {
    const headerChunk = context.chunks.get(CHUNK_TYPES.HEADER) as HeaderChunk;

    if (!headerChunk) {
      throw new Error('HEADER chunk is required for HeaderEntity');
    }

    // Extract only primitives for fast transfer
    return {
      headerVersion: headerChunk.headerVersion,
      version: headerChunk.version,
      codecInfos: headerChunk.codecInfos,
      modifiedDate: headerChunk.modifiedDate,
      oemInfo: headerChunk.oemInfo,
    };
  }

  createFromData(data: HeaderEntityData): HeaderEntity {
    return new HeaderEntity(
      data.headerVersion,
      data.version,
      data.codecInfos,
      data.modifiedDate,
      data.oemInfo,
    );
  }
}
