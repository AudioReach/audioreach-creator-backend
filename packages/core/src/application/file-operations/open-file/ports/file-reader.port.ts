import type {FileRef} from '../utils/file-ref.js';

export interface FileReaderPort {
  /**
   * Read entire content of a file reference and return as Uint8Array.
   * Implementations must be platform-specific adapters (Node, RN),
   * while this interface remains platform-agnostic.
   */
  readAll(ref: FileRef): Promise<Uint8Array>;
}
