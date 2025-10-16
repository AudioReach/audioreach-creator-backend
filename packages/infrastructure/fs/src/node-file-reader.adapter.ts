import {promises as fs} from 'fs';
import * as path from 'path';
import type {FileReaderPort, FileRef} from '@arc/core';

/**
 * Node adapter implementing FileReaderPort.
 * Supports only PathRef; reads from absolute path or file:// URI and returns Uint8Array.
 */
export class NodeFileReaderAdapter implements FileReaderPort {
  async readAll(ref: FileRef): Promise<Uint8Array> {
    if (ref.kind !== 'path') {
      throw new Error('NodeFileReaderAdapter supports only PathRef');
    }
    const filePath = this.normalizeUriToPath(ref.uri);
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  }

  private normalizeUriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
      // file:// URIs can include platform-specific paths; strip scheme
      const withoutScheme = uri.replace(/^file:\/\//, '');
      // On Windows a file:// URI may start with a drive letter (e.g., C:/...), keep as is
      return withoutScheme;
    }
    // Assume absolute path
    return path.isAbsolute(uri) ? uri : path.resolve(uri);
  }
}
