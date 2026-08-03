import test from "node:test";
import assert from "node:assert/strict";
import { buildExportId, buildHevyFolderRequest, buildHevyRoutineRequests, validateHevyExport } from "../hevy-export.js";

const mappings = {
  version: 1,
  templates: {
    press: { hevyExerciseTemplateId: "PRESS", verified: true },
    row: { hevyExerciseTemplateId: "ROW", verified: true },
    core: { hevyExerciseTemplateId: "CORE", verified: true },
    core2: { hevyExerciseTemplateId: "CORE2", verified: true },
    bike: { hevyExerciseTemplateId: "BIKE", verified: true },
  },
};

function routine(sequenceNumber, includeCardio = false) {
  return {
    sequenceNumber,
    restPeriods: [90, 60],
    warmups: [{ id: `warmup-${sequenceNumber}`, name: "Hip hinge drill", dose: "10 reps" }],
    exercises: [
      { id: "press", name: "Press", sets: 3, repRange: "6–10", primary: true, warmupProtocol: "ramp2", formCues: ["Brace the torso."] },
      { id: "row", name: "Row", sets: 3, repRange: "10–15", primary: false },
      { id: "core", name: "Dead bug", sets: 3, repRange: "12–20", primary: false, repUnit: "per side" },
      { id: "core2", name: "Plank", sets: 3, durationRange: "20–40 sec", primary: false },
    ],
    cardio: includeCardio ? { id: "bike", name: "Zone 2 bike ride", timing: [{ sets: "W", duration: "3:00" }, { sets: "1", duration: "25:00" }, { sets: "W", duration: "2:00" }] } : null,
  };
}

test("builds one Hevy folder request", () => {
  assert.deepEqual(buildHevyFolderRequest("2–5–15–30 · Plan abc"), { routine_folder: { title: "2–5–15–30 · Plan abc" } });
});

test("maps order, supersets, rest, warm-ups, and rep ranges without mutating the plan", () => {
  const source = [routine(1, true)];
  const before = structuredClone(source);
  const [payload] = buildHevyRoutineRequests({ routines: source, folderId: 12, exportId: "abc123", mappings });
  assert.deepEqual(source, before);
  assert.deepEqual(payload.routine.exercises.map((exercise) => exercise.exercise_template_id), ["PRESS", "ROW", "CORE", "CORE2", "BIKE"]);
  assert.deepEqual(payload.routine.exercises.slice(0, 4).map((exercise) => exercise.superset_id), [1, 1, 2, 2]);
  assert.equal(payload.routine.exercises[1].rest_seconds, 90);
  assert.equal(payload.routine.exercises[2].rest_seconds, null);
  assert.equal(payload.routine.exercises[3].rest_seconds, 60);
  assert.equal(payload.routine.exercises[0].sets.length, 5);
  assert.deepEqual(payload.routine.exercises[0].sets.at(-1).rep_range, { start: 6, end: 10 });
  assert.match(payload.routine.exercises[2].notes, /each side/);
  assert.equal(payload.routine.exercises.at(-1).sets.length, 3);
});

test("blocks unmapped exercises before writes", () => {
  const result = validateHevyExport([routine(1)], { version: 1, templates: {} });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing.map((exercise) => exercise.id), ["press", "row", "core", "core2"]);
});

test("export IDs are stable for the same plan state", () => {
  const state = { seed: "abc", sessions: 4, selectedEquipment: new Set(["bar", "dumbbells"]), excludedExerciseIds: new Set(["row"]), dynamicWarmups: true, dynamicRest: false };
  assert.equal(buildExportId(state), buildExportId({ ...state, selectedEquipment: new Set(["dumbbells", "bar"]), excludedExerciseIds: new Set(["row"]) }));
});
