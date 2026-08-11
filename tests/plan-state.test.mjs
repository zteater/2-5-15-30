import test from "node:test";
import assert from "node:assert/strict";
import { createPlanState } from "../plan-state.js";

const equipmentCatalog = [
  { key: "dumbbells", group: "primary", isDefault: true, dependencies: [] },
  { key: "bike", group: "cardio", isDefault: false, dependencies: [] },
  { key: "rack", group: "secondary", isDefault: false, dependencies: ["bar"] },
  { key: "bar", group: "primary", isDefault: false, dependencies: [] },
];

function createWindow(search = "") {
  const location = { href: `https://example.test/${search}`.replace("/?", "?") };
  location.search = search;
  return {
    location,
    history: { replaceState: (_state, _title, nextUrl) => { location.href = String(nextUrl); location.search = new URL(nextUrl).search; } },
  };
}

function createDocument() {
  return {
    documentElement: { dataset: {} },
    querySelector: () => null,
  };
}

test("decodes shareable configuration and preserves it in the URL", () => {
  const windowRef = createWindow("?seed=abc.8.1.7.d.0.1.7");
  const plan = createPlanState({
    windowRef,
    documentRef: createDocument(),
    equipmentCatalog,
    cardioEquipment: new Set(["bike"]),
    exerciseIds: new Set(["dead-bug"]),
  });

  assert.equal(plan.state.activeSeed, "abc");
  assert.equal(plan.state.sessionCount, 8);
  assert.equal(plan.state.dynamicWarmups, false);
  assert.equal(plan.state.dynamicRest, true);
  assert.equal(plan.state.selectedEquipment.has("dumbbells"), true);
  assert.equal(windowRef.location.search.includes("seed=abc.8.1."), true);
});

test("deterministic shuffles match for the same seed and settings", () => {
  const makePlan = () => createPlanState({
    windowRef: createWindow("?seed=abc.4.0.1.d.1.1.7"),
    documentRef: createDocument(),
    equipmentCatalog,
    cardioEquipment: new Set(["bike"]),
    exerciseIds: new Set(),
  });
  const first = makePlan();
  const second = makePlan();
  assert.deepEqual(first.shuffle(["a", "b", "c", "d"]), second.shuffle(["a", "b", "c", "d"]));
});
