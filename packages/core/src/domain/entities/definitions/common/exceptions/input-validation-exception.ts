/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Attribute} from 'domain/entities/common/value-objects/attribute.js';

export class DuplicateDataInputPortGroupException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateDataOutputPortGroupException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicatePortIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicatePortNameException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateProcessorIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateContainerTypeNameException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateContainerTypeValueException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateIntentIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateIntentNameException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateKeyValuePairException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateSystemIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateProcessorDefinitionReferenceIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateContainerTypeReferenceIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class NullObjectException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DataPortIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class DataPortNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class StaticPortIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class StaticPortNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class IntentIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class IntentNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ProcessorDefinitionIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ProcessorDefinitionNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ContainerTypeNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ContainerTypeValueNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class IntentPortIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class IntentPortNameNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ValueIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class SystemIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class ParamIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class TagKeyIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class NotDefinedAttributeException extends Error {
  constructor(attr: Attribute) {
    super(`Attribute ${attr.name} -> ${attr.value} is not defined correctly`);
  }
}

export class PortIOTypeNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class PropertyIdNotFoundException extends Error {
  constructor() {
    super();
  }
}

export class DuplicatePropertyIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateParamIdException extends Error {
  constructor(error: string) {
    super(error);
  }
}

export class DuplicateAttributeNameException extends Error {
  constructor(error: string) {
    super(error);
  }
}
