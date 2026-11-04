import { createUnimplementedEcrCodec } from "../unimplemented-ecr";

/** Register when official Bank Alfalah ECR protocol is available. */
export function createAlfalahEcrCodec() {
  return createUnimplementedEcrCodec("Bank Alfalah");
}
