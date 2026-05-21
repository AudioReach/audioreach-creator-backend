/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Parses a multipart/form-data response body according to RFC 2046.
 *
 * This helper extracts individual files from a multipart response by:
 * 1. Splitting the body by boundary markers
 * 2. Parsing headers for each part
 * 3. Extracting the binary content
 *
 * @param body - Raw response body as Buffer
 * @param boundary - Boundary string from Content-Type header
 * @returns Object mapping field names to file contents as Buffers
 *
 * @example
 * ```typescript
 * const contentType = response.headers['content-type'];
 * const boundary = contentType.match(/boundary=(.+)/)[1];
 * const files = parseMultipartResponse(responseBody, boundary);
 * const acdbFile = files['acdbFile'];
 * ```
 */
export function parseMultipartResponse(
  body: Buffer,
  boundary: string,
): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};

  // Convert to binary string for splitting
  const bodyStr = body.toString('binary');
  const parts = bodyStr.split(`--${boundary}`);

  for (const part of parts) {
    // Skip empty parts and closing boundary
    if (!part.trim() || part.trim() === '--') continue;

    // Find header/content separator (double CRLF)
    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) continue;

    // Extract headers
    const headers = part.substring(0, headerEndIndex);
    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const name = nameMatch[1];

    // Extract content (remove trailing CRLF)
    const contentStart = headerEndIndex + 4; // Skip \r\n\r\n
    const contentEnd = part.lastIndexOf('\r\n');
    const content = part.substring(contentStart, contentEnd);

    // Convert back to Buffer
    files[name] = Buffer.from(content, 'binary');
  }

  return files;
}
