export interface StaticIntentDefinitionInit {
  systemId: number;
  intentId: number;
  intentName: string;
}

export class StaticIntentDefinition {
  readonly systemId: number;
  readonly intentId: number;
  intentName: string;

  constructor(initParam: StaticIntentDefinitionInit) {
    this.intentId = initParam.intentId;
    this.systemId = initParam.systemId;
    this.intentName = initParam.intentName;
  }
}
