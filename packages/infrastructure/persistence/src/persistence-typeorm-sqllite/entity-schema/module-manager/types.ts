// domain/enums/moduleType.ts

import {defineEnum} from '../utilities/enum-factory.js';
import {makeEnumTransformer} from '../utilities/enum-value-transformer.js';

export const ModuleType = defineEnum({
  Generic: 2,
  Decoder: 3,
  Encoder: 4,
  Converter: 5,
  Packetizer: 6,
  Depacketizer: 7,
} as const);

export type ModuleTypeName = (typeof ModuleType.names)[number];
export type ModuleTypeValue = (typeof ModuleType.values)[number];
export const ModuleTypeTransformer = makeEnumTransformer<ModuleTypeValue>(
  ModuleType.parseValue,
);

export const InterfaceType = defineEnum({
  Capi: 2,
} as const);

export type InterfaceTypeName = (typeof InterfaceType.names)[number]; // 'Capi'
export type InterfaceTypeValue = (typeof InterfaceType.values)[number];
export const InterfaceTypeTransformer = makeEnumTransformer<InterfaceTypeValue>(
  InterfaceType.parseValue,
);

export const InterfaceVersion = defineEnum({
  CapiV3: 3,
} as const);

export type InterfaceVersionName = (typeof InterfaceVersion.names)[number]; // 'CapiV3'
export type InterfaceVersionValue = (typeof InterfaceVersion.values)[number];
export const InterfaceVersionTransformer =
  makeEnumTransformer<InterfaceVersionValue>(InterfaceVersion.parseValue);
