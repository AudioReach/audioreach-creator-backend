export interface TagDefKeyDefInit {
  keyReferenceSystemId: number;
  tagEnumValue?: string;
}

export class TagDefKeyDefLink {
  readonly keyReferenceSystemId: number;
  tagEnumValue: string;

  constructor(initParam: TagDefKeyDefInit) {
    this.keyReferenceSystemId = initParam.keyReferenceSystemId;
    this.tagEnumValue = initParam.tagEnumValue ?? '';
  }
}
