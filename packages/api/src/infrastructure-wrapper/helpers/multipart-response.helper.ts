/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {randomBytes} from 'node:crypto';
import type {Response} from 'express';

/**
 * Represents a file to be included in a multipart response
 */
export interface MultipartFile {
  /** Form field name (e.g., 'acdbFile', 'workspaceFile') */
  name: string;

  /** Original filename (e.g., 'calibration.acdb') */
  filename: string;

  /** Binary content of the file */
  content: Uint8Array | Buffer;

  /** MIME type of the file (e.g., 'application/octet-stream') */
  contentType: string;
}

/**
 * Helper class for generating RFC 2046 compliant multipart/form-data responses.
 *
 * This is used for endpoints that need to return multiple binary files in a single response.
 * The format mirrors the multipart/form-data format used for file uploads.
 *
 * @example Response Format
 * ```
 * Content-Type: multipart/form-data; boundary=ArcFormBoundary1a2b3c4d...
 *
 * --ArcFormBoundary1a2b3c4d...
 * Content-Disposition: form-data; name="acdbFile"; filename="file.acdb"
 * Content-Type: application/octet-stream
 *
 * [binary content of ACDB file]
 * --ArcFormBoundary1a2b3c4d...
 * Content-Disposition: form-data; name="workspaceFile"; filename="file.awsp"
 * Content-Type: application/json
 *
 * [binary content of workspace file]
 * --ArcFormBoundary1a2b3c4d...--
 * ```
 *
 * @see https://www.rfc-editor.org/rfc/rfc2046#section-5.1 - RFC 2046 Multipart Media Type
 */
export class MultipartResponseHelper {
  /**
   * Generates a cryptographically secure boundary string.
   *
   * The boundary is used to separate different parts in the multipart response.
   * Format: ArcFormBoundary + 32 hex characters (128 bits of entropy)
   *
   * @returns A unique boundary string
   * @private
   */
  private static generateBoundary(): string {
    return `ArcFormBoundary${randomBytes(16).toString('hex')}`;
  }

  /**
   * Builds a multipart/form-data response body according to RFC 2046.
   *
   * Each file is encoded as a separate part with:
   * - Boundary marker (--boundary)
   * - Content-Disposition header (includes field name and filename)
   * - Content-Type header
   * - Blank line
   * - File content (binary)
   * - CRLF
   *
   * The response ends with a closing boundary marker (--boundary--)
   *
   * @param files - Array of files to include in the response
   * @param boundary - The boundary string to use for separating parts
   * @returns Complete multipart response body as Buffer
   * @private
   */
  private static buildMultipartBody(
    files: MultipartFile[],
    boundary: string,
  ): Buffer {
    const parts: Buffer[] = [];

    for (const file of files) {
      // Add part header with boundary marker (RFC 2046 requires '--' prefix)
      // Add file content and CRLF after content
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
            `Content-Type: ${file.contentType}\r\n\r\n`,
        ),
        Buffer.from(file.content),
        Buffer.from('\r\n'),
      );
    }

    // Add closing boundary marker (RFC 2046 requires '--' prefix and '--' suffix)
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return Buffer.concat(parts);
  }

  /**
   * Sends a multipart/form-data response to the client.
   *
   * This method handles the complete multipart response generation:
   * 1. Generates a unique boundary
   * 2. Builds the multipart body with all files
   * 3. Sets appropriate headers (Content-Type, Content-Length)
   * 4. Sends the response
   *
   * @param res - Express Response object
   * @param files - Array of files to include in the response
   *
   * @example
   * ```typescript
   * MultipartResponseHelper.sendMultipartResponse(res, [
   *   {
   *     name: 'acdbFile',
   *     filename: 'calibration.acdb',
   *     content: acdbBuffer,
   *     contentType: 'application/octet-stream'
   *   },
   *   {
   *     name: 'workspaceFile',
   *     filename: 'workspace.awsp',
   *     content: awspBuffer,
   *     contentType: 'application/json'
   *   }
   * ]);
   * ```
   */
  static sendMultipartResponse(res: Response, files: MultipartFile[]): void {
    const boundary = this.generateBoundary();
    const body = this.buildMultipartBody(files, boundary);

    res.set({
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    });

    res.send(body);
  }
}
