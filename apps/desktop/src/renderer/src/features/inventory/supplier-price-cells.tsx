import { formatMoney, pieceCostFromPurchase } from "@blackbox/shared";

export function SupplierPriceCells({
  purchasePrice,
  unitsPerPurchaseUnit,
}: {
  purchasePrice: number;
  unitsPerPurchaseUnit: number;
}) {
  const unitsPer = unitsPerPurchaseUnit > 0 ? unitsPerPurchaseUnit : 1;
  const pricePerPc =
    unitsPer > 1 ? pieceCostFromPurchase(purchasePrice, unitsPer) : purchasePrice;

  return (
    <>
      <td className="px-4 py-3 tabular-nums">{formatMoney(pricePerPc)}</td>
      <td className="px-4 py-3 tabular-nums">
        {unitsPer > 1 ? formatMoney(purchasePrice) : "—"}
      </td>
    </>
  );
}
