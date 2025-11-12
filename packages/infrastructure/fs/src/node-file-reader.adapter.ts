import AdmZip from 'adm-zip';
import {promises as promises} from 'fs';
import {promisify} from 'util';
import * as fs from 'fs';
import * as path from 'path';
import Parser from 'stream-json/Parser.js';
import Pick from 'stream-json/filters/Pick.js';
import StreamValues from 'stream-json/streamers/StreamValues.js';
import type {FileReaderPort, FileRef} from '@arc/core';
//import {unzip} from 'zlib';

const mkdir = promisify(fs.mkdir);
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
    const buffer = await promises.readFile(filePath);
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

  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }

  joinPath(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, extension: string): string {
    return path.basename(filePath, extension);
  }

  async mkdir(dirPath: string): Promise<void> {
    await mkdir(dirPath, {recursive: true});
  }

  async unzip(zipFilePath: string, destinationPath: string): Promise<void> {
    // Create AdmZip instance from file path
    const zip = new AdmZip(zipFilePath);

    // Create destination folder if it doesn't exist
    await this.mkdir(destinationPath);

    // Extract all files to the destination folder
    zip.extractAllTo(destinationPath, true);
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    if (fs.existsSync(dirPath)) {
      // Use fs.rmSync with recursive option (available in Node.js 14.14.0+)
      fs.rmSync(dirPath, {recursive: true, force: true});
    }
  }

  /**
   * Parse JSON file and extract specific block
   * Automatically uses streaming for large files
   */
  async parseBlock(filePath: string, blockName: string): Promise<any[]> {
    // Validate file extension
    const fileExtension = path.extname(filePath).toLowerCase();
    if (fileExtension !== '.json') {
      throw new Error(
        `Unsupported file format: ${fileExtension}. Only .json files are supported.`,
      );
    }

    const isExists = fs.existsSync(filePath);

    // Use streaming for large files
    if (isExists) {
      return this.parseWithStreaming(filePath, blockName);
    }

    // File does not exist
    throw new Error(`File not found: ${filePath}`);
  }

  /**
   * Parse using streaming (for large files)
   */
  private parseWithStreaming(
    filePath: string,
    blockName: string,
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let blockData: any[] = [];
      let found = false;
      const pipeline = fs
        .createReadStream(filePath)
        .pipe(new Parser())
        .pipe(new Pick({filter: blockName}))
        .pipe(new StreamValues());

      pipeline.on('data', ({value}) => {
        found = true;
        // If the value is already an array, use it directly instead of wrapping it
        if (Array.isArray(value)) {
          blockData = value;
        } else {
          blockData.push(value);
        }
      });

      pipeline.on('end', () => {
        if (!found) {
          return reject(
            new Error(`Block "${blockName}" not found in JSON file.`),
          );
        }
        resolve(blockData);
      });

      pipeline.on('error', (error: any) => {
        // Enhanced error reporting with multiple position formats
        let errorMessage = `Error parsing JSON file: ${error.message}`;

        // Try to extract position information from various possible formats
        if (error.position) {
          errorMessage = `Error parsing JSON at line ${error.position.line ?? 'unknown'}, column ${error.position.column ?? 'unknown'}: ${error.message}`;
        } else if (error.line !== undefined || error.column !== undefined) {
          errorMessage = `Error parsing JSON at line ${error.line ?? 'unknown'}, column ${error.column ?? 'unknown'}: ${error.message}`;
        } else if (error.offset !== undefined) {
          errorMessage = `Error parsing JSON at offset ${error.offset}: ${error.message}`;
        }

        // Include the file path for better debugging
        errorMessage = `${errorMessage}\nFile: ${filePath}`;

        reject(new Error(errorMessage));
      });
    });
  }
}
