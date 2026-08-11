import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPlanner } from "../planner.js";

const { exercises } = JSON.parse(fs.readFileSync("exercises.json"));
const { coverageCycle } = JSON.parse(fs.readFileSync("data.json"));
const { equipment } = JSON.parse(fs.readFileSync("equipment.json"));

function createSeededPlanner(seed, settings = {}) {
  const selectedEquipment = new Set(settings.selectedEquipment || equipment.filter((item) => item.isDefault).map((item) => item.key));
  const excludedExerciseIds = new Set(settings.excludedExerciseIds || []);
  let randomState = 2166136261;
  for (const character of seed) {
    randomState ^= character.charCodeAt(0);
    randomState = Math.imul(randomState, 16777619);
  }
  const seededRandom = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const shuffle = (items) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(seededRandom() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled;
  };
  const planner = createPlanner({
    exercises,
    coverageCycle,
    equipmentCatalog: equipment,
    getConfig: () => ({ selectedEquipment, excludedExerciseIds, dynamicWarmups: settings.dynamicWarmups ?? true, dynamicRest: settings.dynamicRest ?? true }),
    shuffle,
    seededRandom,
  });
  return { planner, selectedEquipment };
}

function buildSequence(planner, counts) {
  const musclePlan = planner.buildCoverageMusclePlan(counts);
  let previousExerciseIds = [];
  return counts.map((count, index) => {
    const routine = planner.buildRoutine(index + 1, previousExerciseIds, count, musclePlan[index]);
    if (routine) previousExerciseIds = routine.exercises.map((exercise) => exercise.id);
    return routine;
  });
}

test("planner preserves the routine structure and 30-minute ceiling", () => {
  const { planner } = createSeededPlanner("planner-regression");
  const routines = buildSequence(planner, [4, 5, 4, 5]);
  routines.forEach((routine) => {
    assert.ok(routine);
    assert.ok(routine.liftingMinutes <= 30);
    assert.ok([4, 5].includes(routine.exercises.length));
    assert.equal(routine.totalSets, routine.exercises.length * 3);
  });
});

test("planner output is deterministic for identical settings", () => {
  const first = buildSequence(createSeededPlanner("same-plan").planner, [4, 5, 4, 5]);
  const second = buildSequence(createSeededPlanner("same-plan").planner, [4, 5, 4, 5]);
  assert.deepEqual(first.map((routine) => routine && routine.exercises.map((exercise) => exercise.id)), second.map((routine) => routine && routine.exercises.map((exercise) => exercise.id)));
});

test("fixed rest mode uses the configured superset defaults", () => {
  const { planner } = createSeededPlanner("fixed-rest", { dynamicRest: false });
  const [routine] = buildSequence(planner, [4]);
  assert.deepEqual(routine.restPeriods, [90, 60]);
});

test("equipment dependencies control exercise availability", () => {
  const { planner } = createSeededPlanner("equipment-dependencies", { selectedEquipment: ["dumbbells"] });
  const benchPress = exercises.find((exercise) => exercise.id === "dumbbell-bench-press");
  const floorPress = exercises.find((exercise) => exercise.id === "dumbbell-floor-press");
  assert.equal(planner.matchesSelectedEquipment(benchPress), false);
  assert.equal(planner.matchesSelectedEquipment(floorPress), true);
});

test("superset conflicts are explicit and preserve loaded-bar rules", () => {
  const { planner } = createSeededPlanner("superset-conflicts");
  const barbellRow = exercises.find((exercise) => exercise.id === "barbell-bent-over-row");
  const ezBarRow = exercises.find((exercise) => exercise.id === "ez-bar-bent-over-row");
  const trapBarDeadlift = exercises.find((exercise) => exercise.id === "trap-bar-deadlift");
  const dumbbellPress = exercises.find((exercise) => exercise.id === "dumbbell-floor-press");
  assert.equal(planner.supersetExercisesConflict(barbellRow, [ezBarRow]), true);
  assert.equal(planner.supersetExercisesConflict(barbellRow, [trapBarDeadlift]), true);
  assert.equal(planner.supersetExercisesConflict(dumbbellPress, [barbellRow]), false);
});

test("exercise records use the normalized equipment model", () => {
  const allowedResources = new Set([
    "loaded-olympic-bar",
    "loaded-ez-bar",
    "loaded-trap-bar",
    "landmine",
    "rack",
    "bench-flat",
    "bench-incline",
    "band-anchor",
  ]);
  for (const exercise of exercises) {
    assert.equal("setup" in exercise, false, `${exercise.id} still has setup`);
    assert.equal("setupResources" in exercise, false, `${exercise.id} still has setupResources`);
    for (const resource of exercise.supersetConflicts || []) assert.equal(allowedResources.has(resource), true, `${exercise.id} has unknown conflict ${resource}`);
  }
});
