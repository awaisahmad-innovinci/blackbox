import { createUnimplementedEcrCodec } from "../unimplemented-ecr";

/** Register when official MCB ECR protocol is available. */
export function createMcbEcrCodec() {
  return createUnimplementedEcrCodec("MCB");
}
