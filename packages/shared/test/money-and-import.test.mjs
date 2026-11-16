// Runs against the built package: `pnpm --filter @blackbox/shared test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import shared from "../dist/index.js";

const {
  saleBillTotalsFromInclusiveLines,
  saleReturnBillTotals,
  normalizeImportHeader,
  importHeaderIndexes,
  matchImportEnumValue,
  PRODUCT_TYPES,
  PAYMENT_TERMS,
  ENTITY_STATUSES,
} = shared;

test("Option A return: refund total unchanged, GST split out of line prices", () => {
  // Two lines of Rs 118 each at 18% GST inside the price.
  const lines = [
    { lineTotal: 118, gstPercent: 18 },
    { lineTotal: 118, gstPercent: 18 },
  ];
  const tax = saleReturnBillTotals(lines, 0, 0);
  assert.equal(tax.total, 236); // same refund the customer was charged
  assert.equal(tax.gstAmount, 36);
  assert.equal(tax.subtotal, 200);
  assert.deepEqual(tax, saleBillTotalsFromInclusiveLines(lines));
});

test("Old bill-level-rate return: GST added on top, as before", () => {
  const tax = saleReturnBillTotals([{ lineTotal: 100, gstPercent: 0 }], 17, 0);
  assert.equal(tax.subtotal, 100);
  assert.equal(tax.gstAmount, 17);
  assert.equal(tax.total, 117);
});

test("Zero-GST lines: no GST, total = sum of lines", () => {
  const tax = saleReturnBillTotals([{ lineTotal: 50, gstPercent: 0 }], 0, 0);
  assert.equal(tax.gstAmount, 0);
  assert.equal(tax.total, 50);
});

test("Import headers: trims, lower-cases, spaces to underscores", () => {
  assert.equal(normalizeImportHeader(" variant_name"), "variant_name");
  assert.equal(normalizeImportHeader("HS Code"), "hs_code");
  assert.equal(normalizeImportHeader("﻿sku"), "sku");
});

test("Import headers: maps by name, ignores extra columns, null when one is missing", () => {
  const expected = ["vendor_code", "name", "group_name"];
  assert.deepEqual(
    importHeaderIndexes(["vendor_code", "Name", "products supplies", "group_name"], expected),
    [0, 1, 3],
  );
  assert.equal(importHeaderIndexes(["vendor_code", "name"], expected), null);
});

test("Import enums: label forms map to canonical values, unknown stays null", () => {
  assert.equal(matchImportEnumValue("Stock Item", PRODUCT_TYPES), "STOCK_ITEM");
  assert.equal(matchImportEnumValue("STOCK_ITEM", PRODUCT_TYPES), "STOCK_ITEM");
  assert.equal(matchImportEnumValue("Bill to bill", PAYMENT_TERMS), "BILL_TO_BILL");
  assert.equal(matchImportEnumValue("7 days", PAYMENT_TERMS), "7_DAYS");
  assert.equal(matchImportEnumValue("Active", ENTITY_STATUSES), "active");
  assert.equal(matchImportEnumValue("weekly", PAYMENT_TERMS), null);
  assert.equal(matchImportEnumValue("", PAYMENT_TERMS), null);
});

test("CSV cells: formulas neutralised, numbers untouched, quotes escaped", () => {
  const { escapeCsvField } = shared;
  assert.equal(escapeCsvField("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(escapeCsvField("@cmd"), "'@cmd");
  assert.equal(escapeCsvField(-50), "-50");
  assert.equal(escapeCsvField("Olper's Milk"), "Olper's Milk");
  assert.equal(escapeCsvField("a,b"), "\"a,b\"");
});

test("Person names: real names pass, junk fails", () => {
  const { PERSON_NAME_PATTERN } = shared;
  for (const ok of ["Ali", "Abdul-Rahman", "O'Neil", "Muhammad Ali Jr.", "علی رضا", "José"]) {
    assert.ok(PERSON_NAME_PATTERN.test(ok), ok);
  }
  for (const bad of ["", " Ali", "Ali2", "Ali  Khan", "a--b", "<script>"]) {
    assert.ok(!PERSON_NAME_PATTERN.test(bad), bad);
  }
});
