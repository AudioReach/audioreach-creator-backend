import {BaseChunk} from './base-chunk.js';

/**
 * Header chunk containing ACDB file metadata and version information.
 * Dependencies: None (this is the root chunk)
 */
export class HeaderChunk extends BaseChunk {
  readonly chunkType = 'HEADER';

  /** ACDB file format version */
  version?: string;

  /** Total size of the ACDB file in bytes */
  fileSize?: number;

  /** Number of chunks in the file */
  chunkCount?: number;
}
