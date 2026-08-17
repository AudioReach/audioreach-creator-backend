/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

const PropertyChangeDtoSchema = z.object({
  systemId: z.string(),
  propertyId: z.number().int(),
  propertyName: z.string(),
});

const CkvRefDtoSchema = z.object({
  moduleSystemId: z.string(),
  ckvSystemId: z.string(),
});

export const ScenarioChangeDtoSchema = z.object({
  propertiesAdded: z.array(PropertyChangeDtoSchema),
  propertiesRemoved: z.array(PropertyChangeDtoSchema),
  moduleCkvsAdded: z.array(CkvRefDtoSchema),
  moduleCkvsDeleted: z.array(CkvRefDtoSchema),
});

export const VsidUpdateDtoSchema = z.object({
  affectedSubgraphSystemIds: z.array(z.string()),
});

export const VcpmCkvDtoSchema = z.object({
  configuredParams: z.array(
    z.object({
      paramSystemId: z.string(),
      paramName: z.string(),
      associatedCkvs: z.array(
        z.object({
          ckvSystemId: z.string(),
          ckv: z.array(
            z.object({
              keyId: z.number().int(),
              valueId: z.number().int(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const CreateVcpmCkvDtoSchema = z.object({
  ckvSystemId: z.string(),
  ckv: z.array(
    z.object({
      keyId: z.number().int(),
      valueId: z.number().int(),
    }),
  ),
});

export type ScenarioChangeDto = z.infer<typeof ScenarioChangeDtoSchema>;
export type VsidUpdateDto = z.infer<typeof VsidUpdateDtoSchema>;
export type VcpmCkvDto = z.infer<typeof VcpmCkvDtoSchema>;
export type CreateVcpmCkvDto = z.infer<typeof CreateVcpmCkvDtoSchema>;
