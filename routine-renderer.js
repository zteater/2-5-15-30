export function createRoutineRenderer({ equipmentLabels, exerciseWarmupSets, supersetRestPeriods, labelMuscle }) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function labelEquipment(equipment = []) {
    const hasNonBodyweightEquipment = equipment.some((item) => item !== "bodyweight" && item !== "bench");
    const visibleEquipment = hasNonBodyweightEquipment ? equipment.filter((item) => item !== "bodyweight") : equipment;
    return visibleEquipment.map((item) => (equipmentLabels.get(item) || item).toLowerCase()).join(" + ");
  }

  function exerciseDisplayName(exercise) {
    const prefixes = [
      "Bodyweight bench ",
      "Plyo box ",
      "Trap bar ",
      "Pull-up bar ",
      "Slam ball ",
      "EZ-bar ",
      "Landmine ",
      "Tube band ",
      "Medicine ball ",
      "Bodyweight ",
      "Dumbbell ",
      "Kettlebell ",
      "Barbell ",
      "Band ",
    ];
    const prefix = prefixes.find((candidate) => exercise.name.startsWith(candidate));
    if (!prefix) return exercise.name;
    const movement = exercise.name.slice(prefix.length);
    return `${movement.charAt(0).toUpperCase()}${movement.slice(1)}`;
  }

  function exerciseDescriptor(exercise, muscle) {
    const equipment = [...new Set([...(exercise.equipment || []), ...(exercise.requires || [])])];
    return `${labelEquipment(equipment)} - ${labelMuscle(muscle)}`;
  }

  function exerciseRepRange(exercise) {
    const range = exercise.durationRange || exercise.repRange || "10–15";
    return exercise.repUnit === "per side" ? `${range} / side` : range;
  }

  function exerciseTypeLabel(exercise) {
    if (exercise.type === "warmup") return "Warm-up";
    if (exercise.type === "cardio") return "Cardio";
    if (exercise.conditioning) return "Conditioning";
    return "Strength";
  }

  function formatRestSeconds(seconds) {
    if (!Number.isFinite(seconds)) return null;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function detailEquipment(exercise) {
    const equipment = [...new Set([...(exercise.equipment || []), ...(exercise.requires || [])])]
      .filter((item) => item !== "bodyweight");
    return equipment.length ? equipment.map((item) => equipmentLabels.get(item) || item) : ["No equipment required"];
  }

  function detailPrescription(exercise) {
    if (exercise.type === "cardio") {
      return `<div class="detail-prescription-list">${(exercise.timing || []).map((interval) => `<div><strong>${escapeHtml(interval.sets)} × ${escapeHtml(interval.duration)}</strong></div>`).join("")}</div>`;
    }
    if (exercise.type === "warmup") return `<p>${escapeHtml(exercise.dose || "Move through the assigned dose")}</p>`;
    const sets = exercise.sets || 3;
    const range = exerciseRepRange(exercise);
    const rangeLabel = exercise.durationRange ? range : `${range} reps`;
    const prescription = `<p><strong>${sets} sets × ${escapeHtml(rangeLabel)}</strong></p>`;
    const rest = formatRestSeconds(exercise.detailRestSeconds ?? exercise.restPeriod);
    const restMarkup = rest ? `<p>Rest ${rest} between superset rounds</p>` : "";
    const hasPowerPrep = exercise.conditioning && exercise.warmupProtocol === "powerPrep";
    const warmupSets = exercise.primary || hasPowerPrep ? exerciseWarmupSets(exercise) : (exercise.secondaryWarmupSets || []);
    const warmupMarkup = warmupSets.length
      ? `<div class="detail-subsection"><h4>Warm-up</h4>${warmupSets.map((set) => `<p>${escapeHtml(set)}</p>`).join("")}</div>`
      : "";
    return `${prescription}${restMarkup}${warmupMarkup}`;
  }

  function detailProgression(exercise) {
    if (exercise.type === "warmup" || exercise.type === "cardio") return "";
    const paragraphBreak = "\n\n";
    const sideNote = exercise.repUnit === "per side"
      ? "Complete the assigned range on each side, using the weaker side to set the limit."
      : "";
    const withSideNote = (text) => [text, sideNote].filter(Boolean).join(paragraphBreak);
    if (exercise.repNotes) return withSideNote(exercise.repNotes);
    if (exercise.warmupProtocol === "powerPrep") return withSideNote("Perform each repetition explosively while maintaining control. Stop the set when speed or technique noticeably declines.");
    if (exercise.durationRange) return withSideNote("Maintain good position for the assigned duration. Increase the duration within the range before progressing resistance or difficulty.");
    return withSideNote([
      "Use one working weight for all three sets.",
      "Complete as many clean reps as possible within the assigned range without sacrificing form.",
      "Keep the weight until every set reaches the top of the range, then increase the weight the next time the exercise appears.",
    ].join(paragraphBreak));
  }

  function renderExerciseDetails(exercise) {
    const sections = [
      `<section class="detail-section"><h3>Equipment</h3><ul class="detail-equipment-list">${detailEquipment(exercise).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`,
      `<section class="detail-section"><h3>How to perform</h3><ol class="detail-instruction-list">${(exercise.instructions || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>`,
      `<section class="detail-section"><h3>${exercise.type === "cardio" ? "Timing" : "Sets and reps"}</h3>${detailPrescription(exercise)}</section>`,
    ];
    if (exercise.formCues?.length) sections.push(`<section class="detail-section"><h3>Key cues</h3><ul class="detail-cue-list">${exercise.formCues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join("")}</ul></section>`);
    const progression = detailProgression(exercise);
    if (progression) sections.push(`<section class="detail-section"><h3>Progression</h3>${progression.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`);
    return sections.join("");
  }

  function renderRoutine(routine) {
    const validWarmups = routine.warmups
      .map((warmup, index) => ({ warmup, index }))
      .filter(({ warmup }) => warmup?.name);
    const interactiveAttributes = (exercise, instanceKey) => `data-exercise-id="${escapeHtml(exercise.id)}" data-exercise-instance="${escapeHtml(instanceKey)}" tabindex="0" role="button" aria-label="Open details for ${escapeHtml(exerciseDisplayName(exercise))}"`;
    const warmupMarkup = `<div class="superset warmup-block"><div class="superset-heading"><span>Warm up</span></div>${validWarmups.map(({ warmup, index }) => `<div class="exercise warmup-exercise exercise-row-interactive" ${interactiveAttributes(warmup, `routine-${routine.sequenceNumber}:warmup-${index}-${warmup.id}`)}><span><span class="exercise-name">${exerciseDisplayName(warmup)}</span><span class="exercise-muscle">${exerciseDescriptor(warmup, warmup.muscle)}</span></span><span class="exercise-sets">${warmup.dose}</span></div>`).join("")}</div>`;
    const supersetGroups = routine.exercises.length === 5
      ? [routine.exercises.slice(0, 2), routine.exercises.slice(2)]
      : [routine.exercises.slice(0, 2), routine.exercises.slice(2, 4)];
    const formatRest = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const restPeriods = supersetRestPeriods(routine.exercises);
    const exerciseMarkup = supersetGroups.map((group, groupIndex) => {
      const preparationGroups = group.map((exercise) => {
        const exerciseIndex = routine.exercises.indexOf(exercise);
        const hasPowerPrep = exercise.conditioning && exercise.warmupProtocol === "powerPrep";
        const preparationSets = exercise.primary || hasPowerPrep ? exerciseWarmupSets(exercise) : (exercise.secondaryWarmupSets || []);
        const primarySets = [...preparationSets, `${exercise.sets} × ${exerciseRepRange(exercise)}`];
        return `<div class="exercise exercise-row-interactive" ${interactiveAttributes(exercise, `routine-${routine.sequenceNumber}:exercise-${exerciseIndex}-${exercise.id}`)}><span><span class="exercise-name">${exerciseDisplayName(exercise)}</span><span class="exercise-muscle">${exerciseDescriptor(exercise, exercise.muscle)}</span></span><span class="exercise-sets${primarySets.length > 1 ? " stacked-sets" : ""}">${primarySets.map((set, index) => `<span class="${index < preparationSets.length ? "exercise-warmup-set" : "exercise-working-set"}">${set}</span>`).join("")}</span></div>`;
      }).join("");
      const supersetName = `Superset ${String.fromCharCode(65 + groupIndex)}`;
      const supersetClass = groupIndex === 0 ? "superset-a" : "superset-b";
      const restExercise = `<div class="exercise exercise-rest"><span><span class="exercise-name">Rest</span></span><span class="exercise-sets">${formatRest(restPeriods[groupIndex])}</span></div>`;
      return `<div class="superset ${supersetClass}"><div class="superset-heading"><span>${supersetName}</span></div>${preparationGroups}${restExercise}</div>`;
    }).join("");
    return `<article class="routine-card"><div class="routine-top"><div class="routine-title-row"><h2>Routine ${String(routine.sequenceNumber).padStart(2, "0")}</h2><span class="routine-duration${routine.liftingMinutes > 30 ? " is-over-target" : ""}"><span>${routine.liftingMinutes}′</span>${routine.cardio ? `<span class="routine-duration-divider" aria-hidden="true"><svg viewBox="0 0 4 32"><path d="M2 1v30" /></svg></span><span class="routine-cardio-duration">${routine.cardioMinutes}′</span>` : ""}</span></div></div><div class="exercise-list">${warmupMarkup}${exerciseMarkup}${routine.cardio ? `<div class="superset cardio-block"><div class="superset-heading"><span>Cardio finisher</span></div><div class="exercise cardio-exercise exercise-row-interactive" ${interactiveAttributes(routine.cardio, `routine-${routine.sequenceNumber}:cardio-${routine.cardio.id}`)}><span><span class="exercise-name">${routine.cardio.name}</span><span class="exercise-muscle">cardio - conditioning</span></span><span class="exercise-sets cardio-sets">${routine.cardio.timing.map((interval) => `<span class="${interval.sets === "W" ? "cardio-warmup-set" : "cardio-working-set"}">${interval.sets} × ${interval.duration}</span>`).join("")}</span></div></div>` : ""}</div></article>`;
  }

  return {
    escapeHtml,
    exerciseDisplayName,
    exerciseTypeLabel,
    formatRestSeconds,
    renderExerciseDetails,
    renderRoutine,
  };
}
