import type {FileRef} from '../../file-operations/shared/utils/file-ref.js';

export interface FileReaderPort {
  /**
   * Read entire content of a file reference and return as Uint8Array.
   * Implementations must be platform-specific adapters (Node, RN),
   * while this interface remains platform-agnostic.
   */
  readAll(ref: FileRef): Promise<Uint8Array>;

  parseBlock(filePath: string, blockName: string): Promise<any[]>;

  exists(filePath: string): Promise<boolean>;

  joinPath(...paths: string[]): string;

  dirname(filePath: string): string;
  basename(filePath: string, extension: string): string;
  deleteDirectory(dirPath: string): Promise<void>;

  unzip(zipFilePath: string, outputDir: string): Promise<void>;
}
