export interface ValueDefinitionInit {
  systemId: number;
  valueId: number;
  name: string;
  description?: string;
  cHeaderEnumValue?: string;
  specialValue?: string;
}

export class ValueDefinition {
  systemId: number;
  // member of value entity
  readonly valueId: number;
  name: string;
  description: string;
  enumValue: string;
  specialValue: string;
  constructor(initParam: ValueDefinitionInit) {
    this.systemId = initParam.systemId;
    this.valueId = initParam.valueId;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.enumValue = initParam.cHeaderEnumValue ?? '';
    this.specialValue = initParam.specialValue ?? '';
  }
}
