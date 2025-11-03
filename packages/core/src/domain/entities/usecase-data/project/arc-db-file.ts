export class ArcDbFileEntity {
  public systemId: number;
  public description: string;
  public metadata: string;
  public tag: string;
  public isTarget: boolean;
  public projectSystemId: number;

  constructor(
    systemId: number,
    description: string,
    metadata: string,
    tag: string,
    isTarget: boolean,
    projectSystemId: number
  ) {
    this.systemId = systemId;
    this.description = description;
    this.metadata = metadata;
    this.tag = tag;
    this.isTarget = isTarget;
    this.projectSystemId = projectSystemId;
  }
}
