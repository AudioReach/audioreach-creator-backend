import type {ArcDbFile} from './arc-db-file.js';

export class DuplicateFileException extends Error {
  constructor(fileId: number) {
    super(`File with sys-id: ${fileId} exists`);
    this.name = 'DuplicateFileException';
  }
}
export class ProjectEntity {
  private readonly arcDbFilesIds = new Set<number>();

  readonly systemId: number;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly arcDbFiles: ArcDbFile[] = [];

  constructor(
    systemId: number,
    name: string,
    description: string,
    type: string,
  ) {
    this.systemId = systemId;
    this.name = name;
    this.description = description;
    this.type = type;
  }

  addFile(arcDbFile: ArcDbFile) {
    if (this.arcDbFilesIds.has(arcDbFile.systemId)) {
      throw new DuplicateFileException(arcDbFile.systemId);
    }
    this.arcDbFilesIds.add(arcDbFile.systemId);
    this.arcDbFiles.push(arcDbFile);
  }
}
