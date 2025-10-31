export interface StaticIntentDefinitionInit
{
   intentId: number, 
   intentName: string, 
   maxLinks: number
}

export class StaticIntentDefinition {
    readonly intentId: number;
    intentName: string;
    maxLinks: number;
    

    constructor(initParam: StaticIntentDefinitionInit) {
        this.intentId = initParam.intentId;
        this.intentName = initParam.intentName;
        this.maxLinks = initParam.maxLinks;
    }
}
