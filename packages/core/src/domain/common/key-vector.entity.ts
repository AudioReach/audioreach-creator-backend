export class KeyVectorEntity {
  public systemId: number;
  public kvHash: string;

  constructor(systemId: number, kvHash: string) {
    this.systemId = systemId;
    this.kvHash = kvHash;
  }
}
