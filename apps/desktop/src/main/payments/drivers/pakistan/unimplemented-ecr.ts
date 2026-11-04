import type { ProviderProtocolCodec } from "../../types";

export function createUnimplementedEcrCodec(
  providerLabel: string,
): ProviderProtocolCodec {
  const message = `${providerLabel} ECR is not implemented. Add a driver using the bank's official ECR specification.`;
  const fail = () => {
    throw new Error(message);
  };
  return {
    encodePayment: fail,
    encodeInquiry: fail,
    encodeCancel: fail,
    decode: () => ({
      status: "UNKNOWN",
      amount: 0,
      message,
    }),
  };
}
