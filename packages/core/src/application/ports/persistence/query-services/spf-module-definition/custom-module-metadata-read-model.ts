/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface NameValueReadModel {
  readonly name: string;
  readonly value: string;
}

export interface CustomModuleInterfaceReadModel {
  readonly type: NameValueReadModel;
  readonly version: NameValueReadModel;
}

export interface CustomModuleMetadataReadModel {
  readonly type: NameValueReadModel;
  readonly interface: CustomModuleInterfaceReadModel;
  readonly fileName: string;
  readonly endPointFunctionTag: string;
}
