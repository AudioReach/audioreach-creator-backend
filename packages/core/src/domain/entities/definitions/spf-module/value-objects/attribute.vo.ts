export interface AttributeInit
{
    name: string;
    value: string;
}


export class Attribute {
   name: string;
   value: string;

  constructor(intParam: AttributeInit) {
    this.name = intParam.name;
    this.value = intParam.value;
  }
}
