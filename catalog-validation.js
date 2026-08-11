export const ALLOWED_REP_RANGES = new Set(["6–10", "10–15", "12–20"]);

export const SETUP_RESOURCES = new Set([
  "loaded-olympic-bar",
  "loaded-ez-bar",
  "loaded-trap-bar",
  "rack",
  "bench-flat",
  "bench-incline",
  "landmine",
  "band-anchor",
  "pull-up-bar",
  "plyo-box",
  "open-floor-space",
]);

const NUMERIC_TIME_FIELDS = ["setTime", "setupTime", "restPeriod"];
const TIME_PATTERN = /(\d+):(\d{2})/g;

function parseTimeString(value) {
  const text = String(value);
  const matches = [...text.matchAll(TIME_PATTERN)];
  if (text.includes(":")) {
    const malformed = matches.length === 0 || matches.some((match) => Number(match[2]) > 59);
    if (malformed) return { seconds: [], valid: false };
  }
  const seconds = matches.map((match) => Number(match[1]) * 60 + Number(match[2]));
  return {
    seconds,
    valid: seconds.every((duration) => duration % 15 === 0),
  };
}

function timingSeconds(exercise) {
  return exercise.timing.reduce((total, interval) => {
    const parsed = parseTimeString(interval.duration);
    if (!parsed.valid || parsed.seconds.length !== 1) return Number.NaN;
    const repetitions = /^\d+$/.test(String(interval.sets)) ? Number(interval.sets) : 1;
    return total + repetitions * parsed.seconds[0];
  }, 0);
}

export function validateCatalog({ exercises, equipmentCatalog }) {
  const errors = [];
  const exerciseIds = new Set();
  const equipmentKeys = new Set(equipmentCatalog.map((item) => item.key));

  if (equipmentCatalog.some((item) => !item.key || !item.group || !Array.isArray(item.dependencies))) {
    errors.push("invalid equipment record");
  }

  for (const exercise of exercises) {
    if (!exercise.id || exerciseIds.has(exercise.id)) {
      errors.push(`duplicate or missing exercise ID: ${exercise.id || "(missing)"}`);
    }
    exerciseIds.add(exercise.id);

    if (!Array.isArray(exercise.equipment)) errors.push(`${exercise.id}: equipment must be an array`);
    if (exercise.requires != null && !Array.isArray(exercise.requires)) errors.push(`${exercise.id}: requires must be an array`);
    if (exercise.type === "strength" && !Array.isArray(exercise.supersetConflicts)) {
      errors.push(`${exercise.id}: superset conflicts missing`);
    }
    if ("setup" in exercise || "setupResources" in exercise) errors.push(`${exercise.id}: legacy setup field remains`);
    if (exercise.repUnit === "per side" && exercise.unilateral !== true) errors.push(`${exercise.id}: per-side exercise must be unilateral`);
    if (exercise.type === "strength" && exercise.repRange && !ALLOWED_REP_RANGES.has(exercise.repRange)) {
      errors.push(`${exercise.id}: unsupported rep range ${exercise.repRange}`);
    }

    const requiredEquipment = [...(exercise.equipment || []), ...(exercise.requires || [])];
    const unknownEquipment = requiredEquipment.filter((item) => item !== "bodyweight" && !equipmentKeys.has(item));
    if (unknownEquipment.length) errors.push(`${exercise.id}: unknown equipment ${[...new Set(unknownEquipment)].join(", ")}`);
    const duplicateRequirements = (exercise.requires || []).filter((item) => (exercise.equipment || []).includes(item));
    if (duplicateRequirements.length) errors.push(`${exercise.id}: equipment also listed in requires ${[...new Set(duplicateRequirements)].join(", ")}`);

    for (const field of NUMERIC_TIME_FIELDS) {
      const value = exercise[field];
      if (value == null) continue;
      if (!Number.isInteger(value) || value < 0 || value % 15 !== 0) errors.push(`${exercise.id}: ${field} is not a 15-second increment`);
    }

    for (const [field, value] of [["durationRange", exercise.durationRange], ["dose", exercise.dose]]) {
      if (value == null || !String(value).includes(":")) continue;
      if (!parseTimeString(value).valid) errors.push(`${exercise.id}: ${field} contains an invalid time`);
    }

    for (const resource of exercise.supersetConflicts || []) {
      if (!SETUP_RESOURCES.has(resource)) errors.push(`${exercise.id}: unknown superset conflict ${resource}`);
    }

    if (exercise.type === "cardio") {
      if (!Array.isArray(exercise.timing)) errors.push(`${exercise.id}: cardio timing missing`);
      else {
        for (const interval of exercise.timing) {
          if (!parseTimeString(interval.duration).valid) errors.push(`${exercise.id}: cardio timing contains an invalid duration`);
        }
        if (exercise.setTime != null && exercise.setTime !== timingSeconds(exercise)) {
          errors.push(`${exercise.id}: setTime does not match cardio timing`);
        }
      }
    }
  }

  if (exerciseIds.has("medicine-ball-chest-pass")) errors.push("medicine-ball-chest-pass should be removed");
  return errors;
}
