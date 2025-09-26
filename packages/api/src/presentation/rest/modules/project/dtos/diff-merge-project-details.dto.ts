import { ApiProperty } from "@nestjs/swagger";


export enum MergeType {
  ThreeWay = "THREE_WAY",
  TwoWay = "TWO_WAY",
}


/** DTO for diff and merge project details */
export class DiffMergeProjectDetails {
  @ApiProperty({ enum: MergeType })
  mergeType!: MergeType;

  @ApiProperty({ description: 'Description of the merge operation' })
  mergeDescription!: string;
}
