export interface TagKeyInit
{
    keyReferenceSystemId: number;
    tagEnumValue?: string;
}

export class TagKey {
    readonly keyReferenceSystemId: number;    
    tagEnumValue: string;
    

    constructor(initParam: TagKeyInit) {
        this.keyReferenceSystemId = initParam.keyReferenceSystemId;
        this.tagEnumValue = initParam.tagEnumValue ?? '';
    }
}
