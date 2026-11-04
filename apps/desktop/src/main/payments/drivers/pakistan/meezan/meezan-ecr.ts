import { createUnimplementedEcrCodec } from "../unimplemented-ecr";

/** Register when official Meezan ECR protocol is available. */
export function createMeezanEcrCodec() {
  return createUnimplementedEcrCodec("Meezan");
}
