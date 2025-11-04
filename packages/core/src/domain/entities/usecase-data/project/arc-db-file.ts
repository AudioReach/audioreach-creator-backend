export interface ArcDbFileInit {
  systemId: number;
  description: string;
  metadata: string;
  tag: string;
  isTarget: boolean;
  projectSystemId: number;
}

export class ArcDbFile {
  readonly systemId: number;
  readonly description: string;
  readonly metadata: string;
  readonly tag: string;
  readonly isTarget: boolean;
  readonly projectSystemId: number;

  constructor(initParams: ArcDbFileInit) {
    this.systemId = initParams.systemId;
    this.description = initParams.description;
    this.metadata = initParams.metadata;
    this.tag = initParams.tag;
    this.isTarget = initParams.isTarget;
    this.projectSystemId = initParams.projectSystemId;
  }
}
