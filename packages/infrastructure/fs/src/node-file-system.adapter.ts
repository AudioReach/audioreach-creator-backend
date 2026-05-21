/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import AdmZip from 'adm-zip';
import {promises as promises} from 'node:fs';
import {promisify} from 'node:util';
import * as fs from 'node:fs';
import path from 'node:path';
import Parser from 'stream-json/Parser.js';
import Pick from 'stream-json/filters/Pick.js';
import StreamValues from 'stream-json/streamers/StreamValues.js';
import type {FileSystemPort, PathRef, JsonValue} from '@arc/core';
import {access} from 'node:fs/promises';

const mkdir = promisify(fs.mkdir);

/**
 * Safely resolves a path within a base directory to prevent directory traversal
 * @param baseDir - The base directory
 * @param targetPath - The target path to resolve
 * @returns The resolved path if safe
 * @throws Error if the resolved path escapes the base directory
 */
function safeResolvePath(baseDir: string, targetPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, targetPath);

  // Ensure the resolved path is within the base directory
  if (
    !resolvedTarget.startsWith(resolvedBase + path.sep) &&
    resolvedTarget !== resolvedBase
  ) {
    throw new Error(
      `Path traversal detected: "${targetPath}" resolves outside base directory`,
    );
  }

  return resolvedTarget;
}

/**
 * Interface for JSON parsing errors with position information
 */
interface JsonParseError extends Error {
  position?: {
    line?: number;
    column?: number;
  };
  line?: number;
  column?: number;
  offset?: number;
}
/**
 * Node adapter implementing FileSystemPort.
 * Supports only PathRef; reads from absolute path or file:// URI and returns Uint8Array.
 */
export class NodeFileSystemAdapter implements FileSystemPort {
  async readAll(ref: PathRef): Promise<Uint8Array> {
    if (ref.kind !== 'path') {
      throw new Error('NodeFileSystemAdapter supports only PathRef');
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
    try {
      await access(filePath, fs.constants.F_OK);

      return true;
    } catch {
      return false;
    }
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

    // Safely extract files with path validation to prevent zip slip attacks
    const zipEntries = zip.getEntries();
    const resolvedDestination = path.resolve(destinationPath);

    for (const entry of zipEntries) {
      // Validate each entry path to prevent directory traversal
      const entryPath = safeResolvePath(resolvedDestination, entry.entryName);

      if (entry.isDirectory) {
        await mkdir(entryPath, {recursive: true});
      } else {
        // Ensure parent directory exists
        const entryDir = path.dirname(entryPath);
        await mkdir(entryDir, {recursive: true});

        // Extract file to validated path
        await promises.writeFile(entryPath, entry.getData());
      }
    }
  }

  deleteDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      // Use fs.rmSync with recursive option (available in Node.js 14.14.0+)
      fs.rmSync(dirPath, {recursive: true, force: true});
    }
  }

  zipToBuffer(files: Map<string, string | Uint8Array>): Promise<Uint8Array> {
    const zip = new AdmZip();

    // Add each file to the zip
    for (const [filename, content] of files) {
      if (typeof content === 'string') {
        zip.addFile(filename, Buffer.from(content, 'utf8'));
      } else {
        zip.addFile(filename, Buffer.from(content));
      }
    }

    // Return as Uint8Array
    return Promise.resolve(new Uint8Array(zip.toBuffer()));
  }

  /**
   * Parse JSON file and extract specific block
   * Automatically uses streaming for large files
   */
  parseBlock(filePath: string, blockName: string): Promise<JsonValue[]> {
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
  ): Promise<JsonValue[]> {
    return new Promise((resolve, reject) => {
      let blockData: JsonValue[] = [];
      let found = false;
      const pipeline = fs
        .createReadStream(filePath)
        .pipe(new Parser())
        .pipe(new Pick({filter: blockName}))
        .pipe(new StreamValues());

      pipeline.on('data', ({value}: {value: JsonValue}) => {
        found = true;
        // If the value is already an array, use it directly instead of wrapping it
        if (Array.isArray(value)) {
          blockData = value as JsonValue[];
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

      pipeline.on('error', (error: JsonParseError) => {
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
