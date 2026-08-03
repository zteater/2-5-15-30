const WARMUP_SET_COUNTS = {
  ramp2: 2,
  easy1: 1,
  powerPrep: 1,
  none: 0,
};

function timeMultiplier(exercise) {
  return exercise?.unilateral ? 2 : 1;
}

function preparationSetCount(exercise) {
  const primarySets = exercise?.primary || (exercise?.conditioning && exercise?.warmupProtocol === "powerPrep")
    ? (WARMUP_SET_COUNTS[exercise.warmupProtocol] || 0)
    : 0;
  return primarySets + (exercise?.secondaryWarmupSets?.length || 0);
}

export function calculatePreparationRecoverySeconds(exercises = [], recoverySeconds = 30) {
  return exercises.reduce((total, exercise) => total + preparationSetCount(exercise) * recoverySeconds, 0);
}

export function calculateRoutineSeconds({
  exercises = [],
  warmups = [],
  restPeriods = [],
  transitionSeconds = 120,
  preparationRecoverySeconds = 30,
} = {}) {
  const workingSetSeconds = exercises.reduce((total, exercise) => total
    + (exercise.sets || 0) * (exercise.setTime || 0) * timeMultiplier(exercise), 0);
  const exercisePreparationSeconds = exercises.reduce((total, exercise) => total
    + preparationSetCount(exercise) * (exercise.setTime || 0) * timeMultiplier(exercise), 0);
  const generalWarmupSeconds = warmups.reduce((total, warmup) => total
    + (warmup.setTime || 30) * timeMultiplier(warmup), 0);
  const setupSeconds = [...exercises, ...warmups]
    .reduce((total, exercise) => total + (exercise.setupTime || 0), 0);
  const restSeconds = restPeriods.reduce((total, rest) => total + rest * 2, 0);
  const recoverySeconds = calculatePreparationRecoverySeconds(exercises, preparationRecoverySeconds);

  return workingSetSeconds
    + exercisePreparationSeconds
    + generalWarmupSeconds
    + setupSeconds
    + restSeconds
    + recoverySeconds
    + transitionSeconds;
}

export function calculateRoutineMinutes(candidate) {
  return Math.ceil(calculateRoutineSeconds(candidate) / 60);
}
