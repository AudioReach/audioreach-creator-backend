import { DuplicateKeyValuePairException, NullObjectException, TagKeyIdNotFoundException as TagKeyReferenceNotFoundException } from "../../common/exceptions/input-validation-exception.js";
import type { TagKey } from "../value-objects/tag-key.vo.js";

export interface TagDefinitionInit {
    systemId: number;
    tagId: number,
    name: string,
    description?: string,
    isVoice?: boolean,
    cEnumName?: string,
    cEnumValue?: string,
}

export class TagDefinition {
    systemId: number;
    readonly tagId: number;
    name: string;
    description: string;
    readonly tagKeys: TagKey[] = [];
    isVoice: boolean;
    cEnumName: string;
    cEnumValue: string;

    constructor(initParam: TagDefinitionInit) {
        this.systemId = initParam.systemId;
        this.tagId = initParam.tagId;
        this.name = initParam.name;
        this.description = initParam.description ?? '';
        this.isVoice = initParam.isVoice ?? false
        this.cEnumName = initParam.cEnumName ?? '';
        this.cEnumValue = initParam.cEnumValue ?? '';
    }

    AddTagKey(tagKey: TagKey) {
        if (tagKey == null) {
            throw new NullObjectException("Value is null");
        }

        if (tagKey.keyReferenceSystemId === null) {
            throw new TagKeyReferenceNotFoundException();
        }

        const valueWithSameKeyId = this.tagKeys.some(v => v.keyReferenceSystemId === tagKey.keyReferenceSystemId);
        if (valueWithSameKeyId) {
            throw new DuplicateKeyValuePairException(`Tag Key ${tagKey.keyReferenceSystemId} already exists in TagDefinition for Tag: ${this.tagId}`)
        }

        this.tagKeys.push(tagKey);
    }
}
