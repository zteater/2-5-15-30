import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateCatalog } from "../catalog-validation.js";

const { exercises } = JSON.parse(fs.readFileSync("exercises.json"));
const { equipment } = JSON.parse(fs.readFileSync("equipment.json"));

test("the exercise catalog passes metadata validation", () => {
  assert.deepEqual(validateCatalog({ exercises, equipmentCatalog: equipment }), []);
});

test("catalog validation catches invalid ranges, timing, and equipment", () => {
  const errors = validateCatalog({
    equipmentCatalog: [{ key: "dumbbells", group: "primary", dependencies: [] }],
    exercises: [{
      id: "bad-exercise",
      type: "strength",
      equipment: ["missing-equipment"],
      requires: ["dumbbells"],
      repRange: "8–12",
      repUnit: "per side",
      unilateral: false,
      setTime: 20,
      setupTime: 15,
      restPeriod: 60,
      supersetConflicts: ["unknown-resource"],
      instructions: ["Do the movement."],
    }],
  });
  assert.match(errors.join("; "), /unsupported rep range/);
  assert.match(errors.join("; "), /unknown equipment/);
  assert.match(errors.join("; "), /per-side exercise must be unilateral/);
  assert.match(errors.join("; "), /15-second increment/);
  assert.match(errors.join("; "), /unknown superset conflict/);
});
