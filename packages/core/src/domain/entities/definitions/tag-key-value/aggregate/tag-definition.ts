import {
  DuplicateKeyValuePairException,
  NullObjectException,
  TagKeyIdNotFoundException as TagKeyReferenceNotFoundException,
} from '../../common/exceptions/input-validation-exception.js';
import type {TagDefKeyDefLink} from '../value-objects/tag-key.js';

export interface TagDefinitionInit {
  systemId: number;
  tagId: number;
  name: string;
  description?: string;
  keysAllowed: TagDefKeyDefLink[];
  isVoice?: boolean;
  cHeaderEnumName?: string;
  cHeaderEnumValue?: string;
}

export class TagDefinition {
  readonly systemId: number;
  readonly tagId: number;
  readonly keysAllowed: TagDefKeyDefLink[] = [];
  name: string;
  description: string;
  isVoice: boolean;
  cEnumName: string;
  cEnumValue: string;

  constructor(initParam: TagDefinitionInit) {
    this.systemId = initParam.systemId;
    this.tagId = initParam.tagId;
    this.keysAllowed = initParam.keysAllowed;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.isVoice = initParam.isVoice ?? false;
    this.cEnumName = initParam.cHeaderEnumName ?? '';
    this.cEnumValue = initParam.cHeaderEnumValue ?? '';
  }

  AddTagKey(tagKey: TagDefKeyDefLink) {
    if (!tagKey) {
      throw new NullObjectException('Value is null');
    }

    if (tagKey.keyReferenceSystemId === null) {
      throw new TagKeyReferenceNotFoundException();
    }

    const valueWithSameKeyId = this.keysAllowed.some(
      v => v.keyReferenceSystemId === tagKey.keyReferenceSystemId,
    );
    if (valueWithSameKeyId) {
      throw new DuplicateKeyValuePairException(
        `Tag Key ${tagKey.keyReferenceSystemId} already exists in TagDefinition for Tag: ${this.tagId}`,
      );
    }

    this.keysAllowed.push(tagKey);
  }
}
