"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FREE_CORE_HOURS,
  PRO_CORE_HOURS,
  includedCoreHours,
  parseCodespacesUsage,
  quantityToHours
} = require("../src/codespaces/usage");

test("Codespaces billing parser converts machine hours into core-hours", () => {
  const parsed = parseCodespacesUsage({
    usageItems: [
      { product: "Codespaces", sku: "codespaces_compute_d2", unitType: "hours", grossQuantity: 10, grossAmount: 1.8 },
      { product: "codespaces", sku: "codespaces_compute_d4", unitType: "minutes", grossQuantity: 30, grossAmount: 0.18 },
      { product: "Codespaces", sku: "codespaces_storage", unitType: "gigabyteHours", grossQuantity: 200, grossAmount: 0.02 },
      { product: "Actions", sku: "actions_linux", unitType: "minutes", grossQuantity: 500, grossAmount: 4 }
    ]
  });
  assert.equal(parsed.core_hours, 22);
  assert.equal(parsed.machine_hours, 10.5);
  assert.equal(parsed.compute.length, 2);
  assert.equal(parsed.storage.length, 1);
  assert.equal(parsed.gross_amount, 2);
});

test("Codespaces included core-hour quota is plan-aware", () => {
  assert.equal(FREE_CORE_HOURS, 120);
  assert.equal(PRO_CORE_HOURS, 180);
  assert.equal(includedCoreHours("free"), 120);
  assert.equal(includedCoreHours("PRO"), 180);
  assert.equal(includedCoreHours("team"), null);
  assert.equal(includedCoreHours(null), null);
});

test("quantity conversion handles hour, minute and second billing units", () => {
  assert.equal(quantityToHours(2, "hours"), 2);
  assert.equal(quantityToHours(120, "minutes"), 2);
  assert.equal(quantityToHours(7200, "seconds"), 2);
});

test("billing parser does not double-multiply an explicit core-hour unit", () => {
  const parsed = parseCodespacesUsage({ usageItems: [
    { product: "Codespaces", sku: "codespaces_compute_d4", grossQuantity: 12, unitType: "core-hours", grossAmount: 0 }
  ] });
  assert.equal(parsed.core_hours, 12);
  assert.equal(parsed.machine_hours, 3);
});
