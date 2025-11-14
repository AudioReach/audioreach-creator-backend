export type PathRef = {
  kind: 'path';
  name: string;
  mimeType?: string;
  /**
   * Absolute filesystem path or file:// URI
   */
  uri: string;
};

export type FileRef = PathRef;
