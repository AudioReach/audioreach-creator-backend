export class IntentEntity {
  public systemId: number;
  public intentId: number;
  public controlPortSystemId: number;

  constructor(systemId: number, intentId: number, controlPortSystemId: number) {
    this.systemId = systemId;
    this.intentId = intentId;
    this.controlPortSystemId = controlPortSystemId;
  }
}
