export interface ArcDbFileInit {
  systemId: number;
  description: string;
  metadata: string;
  fileName: string;
  isTarget: boolean;
  projectSystemId: number;
}

export class ArcDbFile {
  readonly systemId: number;
  readonly description: string;
  readonly metadata: string;
  readonly fileName: string;
  readonly isTarget: boolean;
  readonly projectSystemId: number;

  constructor(initParams: ArcDbFileInit) {
    this.systemId = initParams.systemId;
    this.description = initParams.description;
    this.metadata = initParams.metadata;
    this.fileName = initParams.fileName;
    this.isTarget = initParams.isTarget;
    this.projectSystemId = initParams.projectSystemId;
  }
}
