/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {parseParameterData} from '../usecase-designer/shared/parse-elements.js';
import {PARAMETER_ELEMENT_TYPE} from '../../domain/entities/definitions/common/types/element-type.js';
import {DATA_TYPE} from '../../shared/dto/element-data/element-types.js';
import type {PayloadParses} from '../../domain/validation/rules/container/container-property-parse.rule.js';

/**
 * Tells whether a container property payload parses against the
 * `elementsStructure` of its property definition.
 *
 * `parseParameterData` never throws; on a parse failure it returns a fallback
 * `RawData` config element. Container property definitions never declare
 * `RawData`, so a `RawData` element in the result can only be that fallback.
 */
export const containerPayloadParses: PayloadParses = (
  payload,
  elementsStructure,
) => {
  const elements = parseParameterData(payload, elementsStructure);
  return !elements.some(
    el =>
      el.type === PARAMETER_ELEMENT_TYPE.ConfigElement &&
      el.dataType === DATA_TYPE.RawData,
  );
};
