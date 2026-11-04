import type {
  PaymentTerminalProviderId,
  PaymentTerminalSettings,
} from "@blackbox/shared";
import type { ProviderProtocolCodec } from "../types";
import { createOpayEcrCodec } from "../adapters/providers/opay-ecr";
import { createNexoRetailerCodec } from "../drivers/nexo/nexo-retailer-codec";
import { createAlfalahEcrCodec } from "../drivers/pakistan/alfalah/alfalah-ecr";
import { createAlliedEcrCodec } from "../drivers/pakistan/allied/allied-ecr";
import { createMcbEcrCodec } from "../drivers/pakistan/mcb/mcb-ecr";
import { createMeezanEcrCodec } from "../drivers/pakistan/meezan/meezan-ecr";

type CodecFactory = () => ProviderProtocolCodec;

const factories = new Map<PaymentTerminalProviderId, CodecFactory>();

function register(
  providerId: PaymentTerminalProviderId,
  factory: CodecFactory,
): void {
  factories.set(providerId, factory);
}

register("OPAY_ECR", createOpayEcrCodec);
register("NEXO", () =>
  createNexoRetailerCodec({ terminalId: "", merchantId: "" }),
);
register("MEEZAN_ECR", createMeezanEcrCodec);
register("MCB_ECR", createMcbEcrCodec);
register("ALFALAH_ECR", createAlfalahEcrCodec);
register("ALLIED_ECR", createAlliedEcrCodec);

export function resolveProviderCodec(
  providerId: PaymentTerminalProviderId,
  settings?: PaymentTerminalSettings,
): ProviderProtocolCodec {
  if (providerId === "NEXO" && settings) {
    return createNexoRetailerCodec({
      terminalId: settings.terminalId,
      merchantId: settings.merchantId,
    });
  }
  const factory = factories.get(providerId);
  if (!factory) {
    throw new Error(`Unknown payment terminal provider: ${providerId}`);
  }
  return factory();
}
