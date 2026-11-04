import { createUnimplementedEcrCodec } from "../unimplemented-ecr";

/** Register when official Allied Bank ECR protocol is available. */
export function createAlliedEcrCodec() {
  return createUnimplementedEcrCodec("Allied Bank");
}
