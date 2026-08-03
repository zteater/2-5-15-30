const PARAGRAPH_BREAK = "\n\n";

function parseRange(value) {
  const match = String(value || "").match(/(\d+)\s*[–-]\s*(\d+)/);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

function parseDuration(value) {
  const text = String(value || "");
  const clock = text.match(/(\d+):(\d+)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return null;
  return /min/i.test(text) ? Math.round(number * 60) : Math.round(number);
}

function parseDose(value) {
  const text = String(value || "");
  const reps = text.match(/\b(\d+)\b/)?.[1];
  return /:|sec|min/i.test(text)
    ? { reps: null, duration_seconds: parseDuration(text) }
    : { reps: reps ? Number(reps) : null, duration_seconds: null };
}

function repRange(exercise) {
  return parseRange(exercise.repRange || exercise.durationRange);
}

function emptySet(type = "normal") {
  return {
    type,
    weight_kg: null,
    reps: null,
    distance_meters: null,
    duration_seconds: null,
    custom_metric: null,
    rep_range: null,
  };
}

function workingSets(exercise) {
  const range = exercise.durationRange ? null : repRange(exercise);
  return Array.from({ length: exercise.sets || 3 }, () => ({
    ...emptySet(),
    duration_seconds: exercise.durationRange ? parseDuration(exercise.durationRange) : null,
    rep_range: range,
  }));
}

function preparationSets(exercise) {
  const doses = exercise.primary || (exercise.conditioning && exercise.warmupProtocol === "powerPrep")
    ? (exercise.warmupProtocol === "ramp2" ? ["W × 8 × 50%", "W × 4 × 75%"] : exercise.warmupProtocol === "easy1" ? ["W × 5 × 50%"] : exercise.warmupProtocol === "powerPrep" ? ["W × 5"] : [])
    : (exercise.secondaryWarmupSets || []);
  return doses.map((dose) => ({ dose, ...emptySet("warmup"), ...parseDose(dose) }));
}

function exerciseNotes(exercise, restSeconds, supersetName) {
  const notes = [];
  if (exercise.repUnit === "per side") notes.push("Complete the assigned range on each side, using the weaker side to set the limit.");
  if (exercise.durationRange) notes.push(`Hold for ${exercise.durationRange}. Increase duration within the range before increasing difficulty.`);
  if (exercise.formCues?.length) notes.push(exercise.formCues.join(" "));
  if (exercise.primary && exercise.warmupProtocol === "ramp2") notes.push("Warm-up: 8 reps at approximately 50% of working weight; 4 reps at approximately 75%.");
  if (exercise.secondaryWarmupSets?.length) notes.push(`Preparation set: ${exercise.secondaryWarmupSets.join(", ")}.`);
  if (supersetName) notes.push(`Move directly to the next exercise. Rest ${restSeconds} seconds after the full ${supersetName} round.`);
  return notes.join(PARAGRAPH_BREAK) || null;
}

function mappedTemplateId(exercise, mappings) {
  const mapping = mappings?.templates?.[exercise.id];
  return mapping?.verified && mapping.hevyExerciseTemplateId ? mapping.hevyExerciseTemplateId : null;
}

function exportableExercises(routines) {
  return routines.flatMap((routine) => [...routine.exercises, ...(routine.cardio ? [routine.cardio] : [])]);
}

export function validateHevyExport(routines, mappings) {
  const missing = [...new Map(exportableExercises(routines)
    .filter((exercise) => !mappedTemplateId(exercise, mappings))
    .map((exercise) => [exercise.id, exercise.name])).entries()]
    .map(([id, name]) => ({ id, name }));
  return { valid: missing.length === 0, missing };
}

function buildCardioExercises(cardio, mappings) {
  const templateId = mappedTemplateId(cardio, mappings);
  const sets = [];
  (cardio.timing || []).forEach((interval) => {
    const repetitions = /^\d+$/.test(String(interval.sets)) ? Number(interval.sets) : 1;
    for (let index = 0; index < repetitions; index += 1) {
      sets.push({ ...emptySet(), duration_seconds: parseDuration(interval.duration) });
    }
  });
  return {
    exercise_template_id: templateId,
    superset_id: null,
    rest_seconds: null,
    notes: cardio.instructions?.join(PARAGRAPH_BREAK) || null,
    sets,
  };
}

function buildStrengthExercise(exercise, index, routine, mappings) {
  const groupIndex = index < 2 ? 1 : 2;
  const groupEnd = routine.exercises.length === 5 ? (groupIndex === 1 ? 1 : 4) : (groupIndex === 1 ? 1 : 3);
  const restSeconds = routine.restPeriods?.[groupIndex - 1] ?? null;
  const supersetName = `Superset ${String.fromCharCode(64 + groupIndex)}`;
  return {
    exercise_template_id: mappedTemplateId(exercise, mappings),
    superset_id: groupIndex,
    rest_seconds: index === groupEnd ? restSeconds : null,
    notes: exerciseNotes(exercise, index === groupEnd ? restSeconds : null, index === groupEnd ? supersetName : null),
    sets: [...preparationSets(exercise), ...workingSets(exercise)],
  };
}

export function buildHevyFolderRequest(title) {
  return { routine_folder: { title } };
}

export function buildHevyRoutineRequests({ routines, folderId, exportId, mappings }) {
  const validation = validateHevyExport(routines, mappings);
  if (!validation.valid) throw new Error("Missing verified Hevy exercise mappings.");
  return routines.map((routine) => ({
    routine: {
      title: `Routine ${String(routine.sequenceNumber).padStart(2, "0")}`,
      folder_id: folderId,
      notes: [
        "Generated by 2–5–15–30",
        `Plan ID: ${exportId}`,
        `Routine: ${String(routine.sequenceNumber).padStart(2, "0")} of ${String(routines.length).padStart(2, "0")}`,
        "Complete all rounds of Superset A before Superset B.",
        routine.warmups.length ? `Warm-up\n${routine.warmups.map((warmup) => `• ${warmup.name} — ${warmup.dose}`).join("\n")}` : "",
      ].filter(Boolean).join(PARAGRAPH_BREAK),
      exercises: [
        ...routine.exercises.map((exercise, index) => buildStrengthExercise(exercise, index, routine, mappings)),
        ...(routine.cardio ? [buildCardioExercises(routine.cardio, mappings)] : []),
      ],
    },
  }));
}

export function buildExportId({ seed, sessions, selectedEquipment, excludedExerciseIds = [], dynamicWarmups, dynamicRest }) {
  const input = [seed, sessions, [...selectedEquipment].sort().join(","), [...excludedExerciseIds].sort().join(","), dynamicWarmups ? "1" : "0", dynamicRest ? "1" : "0"].join("|");
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
