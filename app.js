const { exerciseLibrary, warmupLibrary, universalWarmupSets, routineBlueprints, cardioOptions, defaultCardio, cardioTiming, equipmentLabels, muscleLabels, primaryWarmupSets, primaryWorkingReps } = window.WORKOUT_DATA;

const equipmentButtons = [...document.querySelectorAll("[data-equipment]")];
const countLabel = document.querySelector("#selection-count");
const output = document.querySelector("#routine-output");
const cardioToggle = document.querySelector("#cardio-toggle");
const sessionSlider = document.querySelector("#session-slider");
const sessionCountOutput = document.querySelector("#session-count-output");
const infoButton = document.querySelector("#info-button");
const infoModal = document.querySelector("#info-modal");
const infoClose = document.querySelector("#info-close");
const progressionButton = document.querySelector("#progression-button");
const progressionModal = document.querySelector("#progression-modal");
const progressionClose = document.querySelector("#progression-close");
const brandLinks = [...document.querySelectorAll(".home-link")];
const configButton = document.querySelector("#config-button");
const configModal = document.querySelector("#config-modal");
const configClose = document.querySelector("#config-close");
const privacyButton = document.querySelector("#privacy-button");
const privacyModal = document.querySelector("#privacy-modal");
const privacyClose = document.querySelector("#privacy-close");
const footerLegal = document.querySelector("#footer-legal");
const easterToast = document.querySelector("#easter-toast");
const sessionOptions = [4, 8, 12, 16];
const defaultEquipment = ["dumbbells", "bench", "barbell", "rack", "bike", "ezbar", "landmine", "pullupbar"];
const planParams = new URLSearchParams(window.location.search);
const loadedFromSeed = Boolean(planParams.get("seed"));
const equipmentKeys = equipmentButtons.map((button) => button.dataset.equipment);
const equipmentIndexes = new Map(equipmentKeys.map((equipment, index) => [equipment, index]));

function parseSessionCount(value) {
  const parsed = Number(value);
  return sessionOptions.includes(parsed) ? parsed : 4;
}

function decodePlanSeed(token) {
  const parts = token?.split(".");
  if (!parts || parts.length !== 4 || !parts[0] || !["0", "1"].includes(parts[2])) return null;
  const equipmentMask = Number.parseInt(parts[3], 36);
  if (!Number.isInteger(equipmentMask)) return null;
  const equipment = equipmentKeys.filter((key) => (equipmentMask & (1 << equipmentIndexes.get(key))) !== 0);
  if (!equipment.length) return null;
  if (!equipment.includes("barbell")) {
    const landmineIndex = equipment.indexOf("landmine");
    if (landmineIndex !== -1) equipment.splice(landmineIndex, 1);
  }
  if (!equipment.length) return null;
  return {
    seed: parts[0],
    sessions: parseSessionCount(parts[1]),
    cardio: parts[2] === "1",
    equipment,
  };
}

const decodedPlan = decodePlanSeed(planParams.get("seed"));
const legacyEquipment = (planParams.get("equipment") || "")
  .split(",")
  .filter((equipment) => equipmentIndexes.has(equipment));
let selectedEquipment = new Set(decodedPlan?.equipment || (legacyEquipment.length ? legacyEquipment : defaultEquipment));
if (!selectedEquipment.has("barbell")) selectedEquipment.delete("landmine");
cardioToggle.checked = decodedPlan ? decodedPlan.cardio : planParams.get("cardio") !== "0";
let sessionCount = decodedPlan?.sessions || parseSessionCount(planParams.get("sessions"));

function createSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(2);
    window.crypto.getRandomValues(values);
    return `${values[0].toString(36)}${values[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function encodePlanSeed() {
  const equipmentMask = [...selectedEquipment].reduce((mask, equipment) => mask | (1 << equipmentIndexes.get(equipment)), 0);
  return `${activeSeed}.${sessionCount}.${cardioToggle.checked ? "1" : "0"}.${equipmentMask.toString(36)}`;
}

function updatePlanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", encodePlanSeed());
  url.searchParams.delete("sessions");
  url.searchParams.delete("equipment");
  url.searchParams.delete("cardio");
  window.history.replaceState({}, "", url);
}

let activeSeed = decodedPlan?.seed || planParams.get("seed") || createSeed();
updatePlanUrl();

function planSeedMaterial() {
  return `${activeSeed}:${sessionCount}:${[...selectedEquipment].sort().join(",")}:${cardioToggle.checked ? "1" : "0"}`;
}

let randomState = hashSeed(planSeedMaterial());
let footerClicks = 0;
let footerClickTimer;

function updateSessionControls() {
  sessionSlider.value = String(sessionCount);
  sessionCountOutput.textContent = `${sessionCount} sessions`;
}

function syncEquipmentButtons() {
  equipmentButtons.forEach((item) => {
    const isSelected = selectedEquipment.has(item.dataset.equipment);
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-pressed", String(isSelected));
  });
  countLabel.textContent = `${selectedEquipment.size} selected`;
}

function resetRandom() {
  randomState = hashSeed(planSeedMaterial());
}

function seededRandom() {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(seededRandom() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function labelMuscle(muscle) {
  return muscleLabels[muscle] || muscle;
}

function labelEquipment(equipment = []) {
  const hasNonBodyweightEquipment = equipment.some((item) => item !== "bodyweight" && item !== "bench");
  const visibleEquipment = hasNonBodyweightEquipment
    ? equipment.filter((item) => item !== "bodyweight")
    : equipment;
  return visibleEquipment.map((item) => (equipmentLabels[item] || item).toLowerCase()).join(" + ");
}

function exerciseDisplayName(exercise) {
  const prefixes = [
    "Bodyweight bench ",
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
  return `${labelEquipment(exercise.equipment)} - ${labelMuscle(muscle)}`;
}

function exerciseRepRange(exercise) {
  if (exercise.repRange) return exercise.repRange;
  if (exercise.muscle === "core" || exercise.name.toLowerCase().includes("calf")) return "12–20";
  if (exercise.sets === 2) return "10–15";
  if (["barbell-", "ezbar-", "landmine-"].some((setup) => exercise.setup?.startsWith(setup))) return "6–10";
  return "10–15";
}

function matchesSelectedEquipment(exercise) {
  const hasPrimaryEquipment = exercise.equipment.some((item) => selectedEquipment.has(item));
  const hasRequiredEquipment = !exercise.requires || exercise.requires.every((item) => selectedEquipment.has(item));
  return hasPrimaryEquipment && hasRequiredEquipment;
}

function setupsConflict(exercise, supersetExercises) {
  return supersetExercises.some((partner) => {
    const usesBar = (setup) => setup?.startsWith("barbell-") || setup?.startsWith("ezbar-") || setup?.startsWith("landmine-");
    const sameBarFamily = usesBar(exercise.setup) && usesBar(partner.setup);
    const exercisePosition = exercise.setup?.split("-").slice(1).join("-");
    const partnerPosition = partner.setup?.split("-").slice(1).join("-");
    return sameBarFamily && exercisePosition !== partnerPosition;
  });
}

function isBodyweightOnly(exercise) {
  return exercise.equipment.includes("bodyweight") && exercise.equipment.every((item) => item === "bodyweight" || item === "bench");
}

function chooseExercise(muscle, supersetExercises = [], exerciseIndex, recentExerciseNames = []) {
  const exercises = exerciseLibrary[muscle];
  const weightedExercises = exercises.filter((exercise) => !isBodyweightOnly(exercise));
  const matchingEquipment = weightedExercises.filter(matchesSelectedEquipment);
  const bodyweightFallback = exercises.filter((exercise) => isBodyweightOnly(exercise));
  const pools = exerciseIndex === 4
    ? [matchingEquipment, bodyweightFallback, weightedExercises]
    : [matchingEquipment, weightedExercises];
  const recentNames = new Set(recentExerciseNames);

  const compatibleExercises = (pool, avoidRecent) => shuffle(pool).filter((exercise) =>
    (!avoidRecent || !recentNames.has(exercise.name)) && !setupsConflict(exercise, supersetExercises),
  );

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, true);
    if (compatible.length) return compatible[0];
  }

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, false);
    if (compatible.length) return compatible[0];
  }

  return shuffle(exercises)[0];
}

function buildRoutine(blueprint, sequenceNumber, recentExerciseNames = []) {
  // Mixed sessions use either four or five focus slots while preserving
  // twice-per-cycle muscle coverage and the 2–5 rule.
  const remainingMuscles = shuffle(blueprint.muscles.filter((muscle) => muscle !== blueprint.primaryMuscle));
  const nonCoreMuscles = remainingMuscles.filter((muscle) => muscle !== "core");
  const muscles = [blueprint.primaryMuscle, ...nonCoreMuscles].slice(0, 5);
  if (blueprint.muscles.includes("core")) muscles[4] = "core";
  const exercises = muscles.reduce((built, muscle, index) => {
    const supersetStart = index < 2 ? 0 : 2;
    const supersetExercises = built.slice(supersetStart);
    built.push({ ...chooseExercise(muscle, supersetExercises, index, recentExerciseNames), muscle, sets: 3, primary: index === 0 });
    return built;
  }, []);
  const warmups = universalWarmupSets[0].map((warmup) => ({ ...warmup, muscle: "fullBody" }));
  if (exercises.length > 4) {
    const optionalExercise = shuffle(exercises)[0];
    const optionalWarmup = chooseWarmups([optionalExercise], warmups.map((warmup) => warmup.name))[0];
    warmups.push({ ...optionalWarmup, muscle: optionalExercise.muscle, optional: true });
  }
  const finalSets = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const minutes = Math.min(30, 8 + (finalSets * 0.9) + (exercises.length * 1.1) + (warmups.length * 0.6));
  return {
    ...blueprint,
    sequenceNumber,
    exercises,
    warmups,
    totalSets: finalSets,
    minutes: Math.round(minutes),
  };
}

function warmupCandidates(muscle) {
  const candidates = warmupLibrary[muscle] || [];
  const matchingEquipment = candidates.filter((warmup) =>
    warmup.equipment.some((item) => selectedEquipment.has(item)),
  );
  const available = matchingEquipment.length
    ? matchingEquipment
    : candidates.filter((warmup) => warmup.equipment.includes("bodyweight"));
  return shuffle(available.length ? available : candidates);
}

function chooseWarmups(exercises, existingWarmupNames = []) {
  const options = exercises.map((exercise, index) => ({
    index,
    candidates: warmupCandidates(exercise.muscle),
  })).sort((a, b) => a.candidates.length - b.candidates.length);
  const selected = Array(exercises.length);
  const usedNames = new Set(existingWarmupNames);

  function assignWarmup(optionIndex) {
    if (optionIndex === options.length) return true;
    const option = options[optionIndex];
    for (const candidate of option.candidates) {
      if (usedNames.has(candidate.name)) continue;
      usedNames.add(candidate.name);
      selected[option.index] = candidate;
      if (assignWarmup(optionIndex + 1)) return true;
      usedNames.delete(candidate.name);
    }
    return false;
  }

  // Every muscle has multiple warmup choices, so this normally finds a
  // unique assignment while still keeping each warmup tied to its exercise.
  assignWarmup(0);
  return selected;
}

function renderRoutine(routine) {
  const warmupMarkup = `<div class="superset warmup-block"><div class="superset-heading"><span>Warm up</span></div>${routine.warmups.map((warmup) => `<div class="exercise warmup-exercise"><span><span class="exercise-name">${exerciseDisplayName(warmup)}</span><span class="exercise-muscle">${exerciseDescriptor(warmup, warmup.muscle)}</span></span><span class="exercise-sets">${warmup.dose}</span></div>`).join("")}</div>`;
  const supersetGroups = routine.exercises.length === 5
    ? [routine.exercises.slice(0, 2), routine.exercises.slice(2)]
    : [routine.exercises.slice(0, 2), routine.exercises.slice(2, 4)];
  const exerciseMarkup = supersetGroups.map((group, groupIndex) => {
    const groupLabel = "Superset";
    const rest = groupIndex === 0 ? "1:30" : "1:00";
    const groupExercises = group.map((exercise) => {
      return `
        <div class="exercise">
          <span><span class="exercise-name">${exerciseDisplayName(exercise)}</span><span class="exercise-muscle">${exerciseDescriptor(exercise, exercise.muscle)}</span></span>
          ${exercise.primary ? `<span class="exercise-sets primary-sets">${primaryWarmupSets.map((warmupSet) => `<span>${warmupSet}</span>`).join("")}<span>${exercise.sets} × ${primaryWorkingReps}</span></span>` : `<span class="exercise-sets">${exercise.sets} × ${exerciseRepRange(exercise)}</span>`}
        </div>`;
    }).join("");
    const supersetName = `${groupLabel} ${String.fromCharCode(65 + groupIndex)}`;
    const supersetClass = groupIndex === 0 ? "superset-a" : "superset-b";
    const restExercise = `<div class="exercise exercise-rest"><span><span class="exercise-name">Rest</span></span><span class="exercise-sets">${rest}</span></div>`;
    return `<div class="superset ${supersetClass}"><div class="superset-heading"><span>${supersetName}</span></div>${groupExercises}${restExercise}</div>`;
  }).join("");
  return `
    <article class="routine-card">
      <div class="routine-top">
        <div class="routine-title-row"><h4>Session ${String(routine.sequenceNumber).padStart(2, "0")}</h4><span class="routine-duration">${routine.minutes}′</span></div>
      </div>
      <div class="exercise-list">${warmupMarkup}${exerciseMarkup}${routine.cardio ? `<div class="superset cardio-block"><div class="superset-heading"><span>Cardio finisher</span></div><div class="exercise cardio-exercise"><span><span class="exercise-name">${routine.cardio}</span><span class="exercise-muscle">cardio - conditioning</span></span><span class="exercise-sets cardio-sets">${cardioTiming.map((interval) => `<span>${interval.sets} × ${interval.duration}</span>`).join("")}</span></div></div>` : ""}</div>
    </article>`;
}

function generatePlan({ newSeed = false } = {}) {
  if (newSeed) {
    activeSeed = createSeed();
    updatePlanUrl();
  }
  resetRandom();
  const availableCardio = cardioOptions.filter((option) =>
    option.equipment.some((item) => selectedEquipment.has(item)),
  );
  const cardioName = availableCardio.length ? () => shuffle(availableCardio)[0].name : () => defaultCardio;
  const blueprintQueue = [];
  while (blueprintQueue.length < sessionCount) blueprintQueue.push(...shuffle(routineBlueprints));
  let previousExerciseNames = [];
  const routines = Array.from({ length: sessionCount }, (_, index) => {
    const blueprint = blueprintQueue[index];
    const routine = buildRoutine(blueprint, index + 1, previousExerciseNames);
    routine.cardio = cardioToggle.checked && routine.exercises.length === 4
      ? cardioName()
      : null;
    previousExerciseNames = routine.exercises.map((exercise) => exercise.name);
    return routine;
  });
  const routineMarkup = routines.map(renderRoutine).join("");
  output.innerHTML = `<div class="routine-grid">${routineMarkup}</div>`;
}

function updateEquipmentState(button) {
  const equipment = button.dataset.equipment;
  if (equipment === "landmine" && !selectedEquipment.has("barbell")) return false;
  if (selectedEquipment.has(equipment)) {
    if (selectedEquipment.size === 1) return false;
    selectedEquipment.delete(equipment);
    if (equipment === "barbell") selectedEquipment.delete("landmine");
  } else {
    selectedEquipment.add(equipment);
  }
  syncEquipmentButtons();
  return true;
}

equipmentButtons.forEach((button) => button.addEventListener("click", () => {
  if (updateEquipmentState(button)) {
    updatePlanUrl();
    generatePlan();
  }
}));
document.querySelector("#regenerate-button").addEventListener("click", () => generatePlan({ newSeed: true }));
cardioToggle.addEventListener("change", () => {
  updatePlanUrl();
  generatePlan();
});
infoButton.addEventListener("click", () => infoModal.showModal());
infoClose.addEventListener("click", () => infoModal.close());
infoModal.addEventListener("click", (event) => {
  if (event.target === infoModal) infoModal.close();
});
progressionButton.addEventListener("click", () => progressionModal.showModal());
progressionClose.addEventListener("click", () => progressionModal.close());
progressionModal.addEventListener("click", (event) => {
  if (event.target === progressionModal) progressionModal.close();
});
configButton.addEventListener("click", () => configModal.showModal());
configClose.addEventListener("click", () => configModal.close());
configModal.addEventListener("click", (event) => {
  if (event.target === configModal) configModal.close();
});
privacyButton.addEventListener("click", () => privacyModal.showModal());
privacyClose.addEventListener("click", () => privacyModal.close());
privacyModal.addEventListener("click", (event) => {
  if (event.target === privacyModal) privacyModal.close();
});
footerLegal.addEventListener("click", (event) => {
  if (event.target.closest("#privacy-button")) return;
  footerClicks += 1;
  clearTimeout(footerClickTimer);
  footerClickTimer = setTimeout(() => { footerClicks = 0; }, 1400);
  if (footerClicks === 5) {
    footerClicks = 0;
    easterToast.textContent = "Secret set unlocked. Add 5 lb and keep going.";
    easterToast.classList.add("is-visible");
    setTimeout(() => easterToast.classList.remove("is-visible"), 3200);
  }
});
brandLinks.forEach((brandLink) => brandLink.addEventListener("click", (event) => {
  event.preventDefault();
  generatePlan({ newSeed: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}));
sessionSlider.addEventListener("input", () => {
  sessionCount = parseSessionCount(sessionSlider.value);
  updateSessionControls();
  updatePlanUrl();
  generatePlan();
});

syncEquipmentButtons();
updateSessionControls();
generatePlan();
window.addEventListener("load", () => {
  if (!loadedFromSeed) document.querySelector(".cards-actions").scrollIntoView({ behavior: "auto", block: "start" });
});
