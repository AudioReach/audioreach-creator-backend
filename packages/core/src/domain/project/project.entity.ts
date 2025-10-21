export class ProjectEntity {
  public systemId: number;
  public name: string;
  public description: string;
  public type: string;

  constructor(systemId: number, name: string, description: string, type: string) {
    this.systemId = systemId;
    this.name = name;
    this.description = description;
    this.type = type;
  }
}
