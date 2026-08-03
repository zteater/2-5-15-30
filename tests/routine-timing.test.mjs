import test from "node:test";
import assert from "node:assert/strict";
import { calculateRoutineMinutes, calculateRoutineSeconds } from "../routine-timing.js";

test("routine timing includes working sets, preparation, warm-ups, setup, rest, and transition", () => {
  const candidate = {
    exercises: [
      { primary: true, warmupProtocol: "ramp2", sets: 3, setTime: 60, setupTime: 45 },
      { sets: 3, setTime: 45, setupTime: 15 },
      { unilateral: true, secondaryWarmupSets: ["W × 5–8 × 50%"], sets: 3, setTime: 30, setupTime: 10 },
      { sets: 3, setTime: 30, setupTime: 10 },
    ],
    warmups: [{ setTime: 30, setupTime: 5 }],
    restPeriods: [120, 60],
    transitionSeconds: 120,
    preparationRecoverySeconds: 30,
  };

  assert.equal(calculateRoutineSeconds(candidate), 1450);
  assert.equal(calculateRoutineMinutes(candidate), 25);
});

test("unilateral warm-ups and working sets use the per-side time multiplier", () => {
  assert.equal(calculateRoutineSeconds({
    exercises: [{ unilateral: true, sets: 3, setTime: 30 }],
    warmups: [{ unilateral: true, setTime: 20 }],
    transitionSeconds: 0,
  }), 220);
});
