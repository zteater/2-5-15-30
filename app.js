async function startApp() {
  const loadJson = (file) => fetch(`./${file}?v=20260971`).then((response) => {
    if (!response.ok) throw new Error(`Unable to load workout data (${response.status})`);
    return response.json();
  });
  const [
    { exercises },
    { routineBlueprints },
    { equipment: equipmentCatalog },
  ] = await Promise.all([
    loadJson("exercises.json"),
    loadJson("data.json"),
    loadJson("equipment.json"),
  ]);

const equipmentButtons = [...document.querySelectorAll("[data-equipment]")];
const countLabel = document.querySelector("#selection-count");
const output = document.querySelector("#routine-output");
const sessionSlider = document.querySelector("#session-slider");
const dynamicWarmupToggle = document.querySelector("#dynamic-warmups-toggle");
const dynamicRestToggle = document.querySelector("#dynamic-rest-toggle");
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
const shareButton = document.querySelector("#share-button");
const sharePopover = document.querySelector("#share-popover");
const menuButton = document.querySelector("#menu-button");
const mobileMenu = document.querySelector("#mobile-menu");
const menuClose = document.querySelector("#menu-close");
const menuBackdrop = document.querySelector("#menu-backdrop");
const themeToggles = [...document.querySelectorAll("[data-theme-toggle]")];
const legalButton = document.querySelector("#legal-button");
const legalFooterButton = document.querySelector("#legal-footer-button");
const legalModal = document.querySelector("#legal-modal");
const legalClose = document.querySelector("#legal-close");
const sessionOptions = [4, 8, 12, 16];
const FIXED_REST_PERIODS = [90, 60];
const PRIMARY_REST_PERIOD = 120;
const ROUTINE_TRANSITION_SECONDS = 120;
const COVERAGE_MUSCLES = ["shoulders", "biceps", "triceps", "back", "chest", "quads", "hamstrings", "calves"];
const PRIMARY_COVERAGE_MUSCLES = ["shoulders", "back", "chest", "quads", "hamstrings"];
const equipmentLabels = new Map(equipmentCatalog.flatMap((item) => [
  [item.key, item.label],
  ...(item.aliases || []).map((alias) => [alias, item.label]),
]));
const primaryLiftingEquipment = new Set(equipmentCatalog.filter((item) => item.group === "primary").map((item) => item.key));
const cardioEquipment = new Set(equipmentCatalog.filter((item) => item.group === "cardio").map((item) => item.key));
const conditioningEquipment = new Set(equipmentCatalog.filter((item) => item.group === "conditioning").map((item) => item.key));
const strengthExercises = exercises.filter((exercise) => exercise.type === "strength");
const cardioExercises = exercises.filter((exercise) => exercise.type === "cardio");
const universalWarmups = exercises.filter((exercise) => exercise.type === "warmup" && exercise.isUniversal && exercise.universalSet === 0);
const equipmentDependencies = new Map(equipmentCatalog.map((item) => [item.key, item.dependencies || []]));
const defaultEquipment = equipmentCatalog.filter((item) => item.isDefault).map((item) => item.key);
const planParams = new URLSearchParams(window.location.search);
const loadedFromSeed = Boolean(planParams.get("seed"));
const equipmentKeys = equipmentCatalog.map((item) => item.key);
const equipmentIndexes = new Map(equipmentKeys.map((equipment, index) => [equipment, index]));

function parseSessionCount(value) {
  const parsed = Number(value);
  return sessionOptions.includes(parsed) ? parsed : 4;
}

function decodePlanSeed(token) {
  const parts = token?.split(".");
  if (!parts || parts.length !== 8 || !parts[0] || !["0", "1"].includes(parts[2])) return null;
  if (parts[7] !== "7" || !["0", "1"].includes(parts[5]) || !["0", "1"].includes(parts[6]) || !["d", "l"].includes(parts[4])) return null;
  const equipmentMask = Number.parseInt(parts[3], 36);
  if (!Number.isInteger(equipmentMask)) return null;
  const equipment = equipmentKeys.filter((key, index) => (equipmentMask & (1 << index)) !== 0);
  if (!equipment.length) return null;
  if (!equipment.includes("bar")) {
    const landmineIndex = equipment.indexOf("landmine");
    if (landmineIndex !== -1) equipment.splice(landmineIndex, 1);
  }
  if (!equipment.length) return null;
  return {
    seed: parts[0],
    sessions: parseSessionCount(parts[1]),
    cardio: parts[2] === "1",
    equipment,
    theme: parts[4] === "l" ? "light" : "dark",
    dynamicWarmups: parts[5] === "1",
    dynamicRest: parts[6] === "1",
  };
}

const decodedPlan = decodePlanSeed(planParams.get("seed"));
let selectedEquipment = new Set(decodedPlan?.equipment || defaultEquipment);
if (!selectedEquipment.has("bar")) {
  selectedEquipment.delete("landmine");
  selectedEquipment.delete("rack");
}
let sessionCount = decodedPlan?.sessions || 4;
let dynamicWarmups = decodedPlan?.dynamicWarmups ?? true;
let dynamicRest = decodedPlan?.dynamicRest ?? true;
document.documentElement.dataset.theme = decodedPlan?.theme || "dark";

function cardioEnabled() {
  return [...selectedEquipment].some((equipment) => cardioEquipment.has(equipment));
}

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
  const themeCode = document.documentElement.dataset.theme === "light" ? "l" : "d";
  return `${activeSeed}.${sessionCount}.${cardioEnabled() ? "1" : "0"}.${equipmentMask.toString(36)}.${themeCode}.${dynamicWarmups ? "1" : "0"}.${dynamicRest ? "1" : "0"}.7`;
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
  return `${activeSeed}:${sessionCount}:${[...selectedEquipment].sort().join(",")}:${cardioEnabled() ? "1" : "0"}:${dynamicWarmups ? "1" : "0"}:${dynamicRest ? "1" : "0"}`;
}

let randomState = hashSeed(planSeedMaterial());
const sunIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>';
const moonIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3 8.5 8.5 0 1 0 20.7 15.3z" /></svg>';
function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggles.forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.innerHTML = isDark ? sunIcon : moonIcon;
    toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  });
}

themeToggles.forEach((toggle) => toggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  updatePlanUrl();
}));
setTheme(decodedPlan?.theme || "dark");
dynamicWarmupToggle.checked = dynamicWarmups;
dynamicRestToggle.checked = dynamicRest;

const showLegal = (event) => {
  event?.stopPropagation();
  legalModal.showModal();
};
legalButton.addEventListener("click", showLegal);
legalFooterButton.addEventListener("click", showLegal);
legalClose.addEventListener("click", () => legalModal.close());
legalModal.addEventListener("click", (event) => {
  if (event.target === legalModal) legalModal.close();
});

function updateSessionControls() {
  sessionSlider.value = String(sessionCount);
  sessionSlider.style.setProperty("--slider-progress", `${(sessionCount / 16) * 100}%`);
}

function syncEquipmentButtons() {
  equipmentButtons.forEach((item) => {
    const isSelected = selectedEquipment.has(item.dataset.equipment);
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-pressed", String(isSelected));
  });
  if (countLabel) countLabel.textContent = `${selectedEquipment.size} selected`;
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
  return muscle;
}

function labelEquipment(equipment = []) {
  const hasNonBodyweightEquipment = equipment.some((item) => item !== "bodyweight" && item !== "bench");
  const visibleEquipment = hasNonBodyweightEquipment
    ? equipment.filter((item) => item !== "bodyweight")
    : equipment;
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
  return exercise.repUnit ? `${range} ${exercise.repUnit}` : range;
}

const WARMUP_PROTOCOLS = {
  ramp2: ["W × 8 × 50%", "W × 4 × 75%"],
  easy1: ["W × 5 × 50%"],
  powerPrep: ["W × 5"],
  none: [],
};

function exerciseWarmupSets(exercise) {
  return WARMUP_PROTOCOLS[exercise.warmupProtocol] || [];
}

function matchesSelectedEquipment(exercise) {
  const requirements = [...(exercise.equipment || []), ...(exercise.requires || [])]
    .filter((item) => item !== "bodyweight")
    .flatMap((item) => {
      if (item !== "barbell") return [item];
      return ["bar"];
    });
  return [...new Set(requirements)]
    .every((item) => selectedEquipment.has(item));
}

function setupsConflict(exercise, supersetExercises) {
  return supersetExercises.some((partner) => {
    const usesLoadedBar = (setup) => ["barbell-", "ezbar-", "landmine-", "trapbar-"]
      .some((barSetup) => setup?.startsWith(barSetup));
    return usesLoadedBar(exercise.setup) && usesLoadedBar(partner.setup);
  });
}

function isBodyweightOnly(exercise) {
  return exercise.equipment.includes("bodyweight") && exercise.equipment.every((item) => item === "bodyweight" || item === "bench");
}

function chooseExercise(muscle, supersetExercises = [], exerciseIndex, recentExerciseIds = []) {
  const muscleExercises = strengthExercises.filter((exercise) => exercise.primaryMuscle === muscle);
  const matchingExercises = muscleExercises.filter(matchesSelectedEquipment);
  const weightedExercises = matchingExercises.filter((exercise) => !isBodyweightOnly(exercise) && !exercise.conditioning);
  const bodyweightFallback = matchingExercises.filter((exercise) => isBodyweightOnly(exercise));
  const primaryExercises = weightedExercises.filter((exercise) => exercise.primaryEligible);
  const pools = exerciseIndex === 0 && primaryExercises.length
    ? [primaryExercises, weightedExercises]
    : exerciseIndex === 4
      ? [weightedExercises, bodyweightFallback]
      : [weightedExercises];
  const recentIds = new Set(recentExerciseIds);

  const compatibleExercises = (pool, avoidRecent) => shuffle(pool).filter((exercise) =>
    (!avoidRecent || !recentIds.has(exercise.id)) && !setupsConflict(exercise, supersetExercises),
  );

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, true);
    if (compatible.length) return compatible[0];
  }

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, false);
    if (compatible.length) return compatible[0];
  }

  return null;
}

function chooseFinalExercise(preferredMuscle, supersetExercises = [], recentExerciseIds = []) {
  const candidates = strengthExercises
    .filter(matchesSelectedEquipment)
    .filter((exercise) => exercise.primaryMuscle === "core"
      || isBodyweightOnly(exercise)
      || exercise.conditioning
      || exercise.equipment.some((item) => conditioningEquipment.has(item)))
    .map((exercise) => ({ ...exercise, muscle: exercise.primaryMuscle }));
  const preferred = preferredMuscle === "core"
    ? candidates.filter((exercise) => exercise.muscle === "core")
    : [];
  const pools = preferred.length ? [preferred, candidates] : [candidates];
  const recentIds = new Set(recentExerciseIds);
  const compatibleExercises = (pool, avoidRecent) => shuffle(pool).filter((exercise) =>
    (!avoidRecent || !recentIds.has(exercise.id)) && !setupsConflict(exercise, supersetExercises),
  );

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, true);
    if (compatible.length) return compatible[0];
  }

  for (const pool of pools) {
    const compatible = compatibleExercises(pool, false);
    if (compatible.length) return compatible[0];
  }

  return null;
}

function buildRoutine(blueprint, sequenceNumber, recentExerciseIds = [], targetExerciseCount = blueprint.muscles.length, targetMuscles = null) {
  // The first four slots are lifting work. A fifth slot is reserved for
  // core, bodyweight, or conditioning work.
  const nonCoreMuscles = shuffle(blueprint.muscles.filter((muscle) => muscle !== blueprint.primaryMuscle && muscle !== "core"));
  const liftingMuscles = (targetMuscles || [blueprint.primaryMuscle, ...nonCoreMuscles])
    .slice(0, Math.min(4, targetExerciseCount));
  const exercises = liftingMuscles.reduce((built, muscle, index) => {
    const supersetStart = index < 2 ? 0 : 2;
    const supersetExercises = built.slice(supersetStart);
    const selectedExercise = chooseExercise(muscle, supersetExercises, index, recentExerciseIds);
    if (!selectedExercise) return built;
    built.push({ ...selectedExercise, muscle, sets: 3, primary: index === 0 });
    return built;
  }, []);
  if (targetExerciseCount === 5) {
    const finalExercise = chooseFinalExercise(
      targetMuscles?.includes("core") || blueprint.muscles.includes("core") ? "core" : null,
      exercises.slice(2),
      recentExerciseIds,
    );
    if (finalExercise) exercises.push({ ...finalExercise, sets: 3, primary: false });
  }
  const warmupTargets = shuffle(exercises.slice(0, 4)).slice(0, Math.min(3, exercises.length));
  const matchedWarmups = dynamicWarmups ? chooseWarmups(warmupTargets) : [];
  const warmups = dynamicWarmups
    ? matchedWarmups.flatMap((warmup, index) => warmup
      ? [{ ...warmup, muscle: warmupTargets[index].muscle }]
      : [])
    : universalWarmups.map((warmup) => ({ ...warmup, muscle: "full body" }));
  if (exercises.length > 4) {
    const optionalExercise = shuffle(exercises)[0];
    const optionalWarmup = chooseWarmups([optionalExercise], warmups.map((warmup) => warmup.id))[0];
    if (optionalWarmup) warmups.push({ ...optionalWarmup, muscle: optionalExercise.muscle, optional: true });
  }
  const finalSets = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  const exerciseTimeMultiplier = (exercise) => exercise.unilateral ? 2 : 1;
  const workingSetSeconds = exercises.reduce((total, exercise) => total
    + (exercise.sets * exercise.setTime * exerciseTimeMultiplier(exercise)), 0);
  const exerciseWarmupSeconds = exercises.reduce((total, exercise) => total
    + (exercise.primary
      ? exerciseWarmupSets(exercise).length * exercise.setTime * exerciseTimeMultiplier(exercise)
      : 0), 0);
  const warmupSeconds = warmups.reduce((total, warmup) => total
    + ((warmup.setTime || 30) * exerciseTimeMultiplier(warmup)), 0) + exerciseWarmupSeconds;
  const setupTearDownSeconds = [...exercises, ...warmups]
    .reduce((total, exercise) => total + (exercise.setupTime || 0), 0);
  // Three rounds have two between-round rest intervals. The separate
  // transition allowance covers setup between supersets/routines.
  const restSeconds = supersetRestPeriods(exercises).reduce((total, rest) => total + (rest * 2), 0);
  const minutes = Math.ceil((workingSetSeconds + warmupSeconds + setupTearDownSeconds + restSeconds + ROUTINE_TRANSITION_SECONDS) / 60);
  return {
    ...blueprint,
    sequenceNumber,
    exercises,
    warmups,
    totalSets: finalSets,
    liftingMinutes: Math.round(minutes),
    cardioMinutes: 0,
    minutes: Math.round(minutes),
  };
}

function buildCoverageMusclePlan(routineExerciseCounts) {
  const firstRoutineSet = shuffle(PRIMARY_COVERAGE_MUSCLES).slice(0, 4);
  const secondRoutinePrimary = shuffle(PRIMARY_COVERAGE_MUSCLES
    .filter((muscle) => !firstRoutineSet.includes(muscle))).slice(0, 1);
  const secondRoutineSet = [
    ...secondRoutinePrimary,
    ...shuffle(COVERAGE_MUSCLES.filter((muscle) => !firstRoutineSet.includes(muscle) && !secondRoutinePrimary.includes(muscle))),
  ];

  return routineExerciseCounts.map((exerciseCount, index) => {
    const muscleSet = index % 2 === 0 ? firstRoutineSet : secondRoutineSet;
    const primaryMuscle = muscleSet.find((muscle) => PRIMARY_COVERAGE_MUSCLES.includes(muscle));
    const muscles = [primaryMuscle, ...shuffle(muscleSet.filter((muscle) => muscle !== primaryMuscle))];
    return exerciseCount === 5 ? [...muscles, "core"] : muscles;
  });
}

function warmupCandidates(muscle) {
  const candidates = exercises.filter((exercise) => exercise.type === "warmup" && exercise.primaryMuscle === muscle);
  const matchingEquipment = candidates.filter(matchesSelectedEquipment);
  const available = matchingEquipment.length
    ? matchingEquipment
    : candidates.filter((warmup) => warmup.equipment.includes("bodyweight"));
  return shuffle(available.length ? available : candidates);
}

function chooseWarmups(exercises, existingWarmupIds = []) {
  const options = exercises.map((exercise, index) => ({
    index,
    candidates: warmupCandidates(exercise.muscle),
  })).sort((a, b) => a.candidates.length - b.candidates.length);
  const selected = Array(exercises.length);
  const usedIds = new Set(existingWarmupIds);

  function assignWarmup(optionIndex) {
    if (optionIndex === options.length) return true;
    const option = options[optionIndex];
    for (const candidate of option.candidates) {
      if (usedIds.has(candidate.id)) continue;
      usedIds.add(candidate.id);
      selected[option.index] = candidate;
      if (assignWarmup(optionIndex + 1)) return true;
      usedIds.delete(candidate.id);
    }
    return false;
  }

  // Every muscle has multiple warmup choices, so this normally finds a
  // unique assignment while still keeping each warmup tied to its exercise.
  assignWarmup(0);
  return selected;
}

function exerciseRestPeriod(exercise) {
  const exercisePeriod = exercise.restPeriod ?? FIXED_REST_PERIODS[1];
  return exercise.primary ? Math.max(exercisePeriod, PRIMARY_REST_PERIOD) : exercisePeriod;
}

function supersetRestPeriods(exercises) {
  const groups = exercises.length === 5
    ? [exercises.slice(0, 2), exercises.slice(2)]
    : [exercises.slice(0, 2), exercises.slice(2, 4)];
  return groups.map((group, groupIndex) => {
    if (!dynamicRest) return FIXED_REST_PERIODS[groupIndex];
    return group.length
      ? Math.max(...group.map(exerciseRestPeriod))
      : FIXED_REST_PERIODS[1];
  });
}

function cardioDurationMinutes(cardio) {
  return cardio?.timing.reduce((total, interval) => {
    const duration = Number.parseFloat(interval.duration);
    return total + (interval.duration.includes("sec") ? duration / 60 : duration);
  }, 0) || 0;
}

function renderRoutine(routine) {
  const validWarmups = routine.warmups.filter((warmup) => warmup?.name);
  const warmupMarkup = `<div class="superset warmup-block"><div class="superset-heading"><span>Warm up</span></div>${validWarmups.map((warmup) => `<div class="exercise warmup-exercise"><span><span class="exercise-name">${exerciseDisplayName(warmup)}</span><span class="exercise-muscle">${exerciseDescriptor(warmup, warmup.muscle)}</span></span><span class="exercise-sets">${warmup.dose}</span></div>`).join("")}</div>`;
  const supersetGroups = routine.exercises.length === 5
    ? [routine.exercises.slice(0, 2), routine.exercises.slice(2)]
    : [routine.exercises.slice(0, 2), routine.exercises.slice(2, 4)];
  const formatRest = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const restPeriods = supersetRestPeriods(routine.exercises);
  const exerciseMarkup = supersetGroups.map((group, groupIndex) => {
    const groupLabel = "Superset";
    const rest = formatRest(restPeriods[groupIndex]);
    const groupExercises = group.map((exercise) => {
      const primarySets = exercise.primary
        ? [...exerciseWarmupSets(exercise), `${exercise.sets} × ${exerciseRepRange(exercise)}`]
        : [`${exercise.sets} × ${exerciseRepRange(exercise)}`];
      return `
        <div class="exercise">
          <span><span class="exercise-name">${exerciseDisplayName(exercise)}</span><span class="exercise-muscle">${exerciseDescriptor(exercise, exercise.muscle)}</span></span>
          <span class="exercise-sets${exercise.primary ? " primary-sets" : ""}">${primarySets.map((set) => `<span>${set}</span>`).join("")}</span>
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
        <div class="routine-title-row"><h4>Routine ${String(routine.sequenceNumber).padStart(2, "0")}</h4><span class="routine-duration${routine.liftingMinutes > 30 ? " is-over-target" : ""}"><span>${routine.liftingMinutes}′</span>${routine.cardio ? `<span class="routine-duration-divider" aria-hidden="true"><svg viewBox="0 0 4 32"><path d="M2 1v30" /></svg></span><span class="routine-cardio-duration">${routine.cardioMinutes}′</span>` : ""}</span></div>
      </div>
      <div class="exercise-list">${warmupMarkup}${exerciseMarkup}${routine.cardio ? `<div class="superset cardio-block"><div class="superset-heading"><span>Cardio finisher</span></div><div class="exercise cardio-exercise"><span><span class="exercise-name">${routine.cardio.name}</span><span class="exercise-muscle">cardio - conditioning</span></span><span class="exercise-sets cardio-sets">${routine.cardio.timing.map((interval) => `<span>${interval.sets} × ${interval.duration}</span>`).join("")}</span></div></div>` : ""}</div>
    </article>`;
}

function buildBlueprintQueue() {
  const queue = [];
  const primaryMuscles = [...new Set(routineBlueprints.map((blueprint) => blueprint.primaryMuscle))];
  let previousPrimary = null;
  const pools = new Map(primaryMuscles.map((muscle) => [
    muscle,
    shuffle(routineBlueprints.filter((blueprint) => blueprint.primaryMuscle === muscle)),
  ]));

  while (queue.length < sessionCount) {
    const candidateMuscles = primaryMuscles.filter((muscle) => muscle !== previousPrimary);
    const primaryMuscle = shuffle(candidateMuscles.length ? candidateMuscles : primaryMuscles)[0];
    const pool = pools.get(primaryMuscle);
    if (!pool.length) {
      pool.push(...shuffle(routineBlueprints.filter((blueprint) => blueprint.primaryMuscle === primaryMuscle)));
    }
    queue.push(pool.shift());
    previousPrimary = primaryMuscle;
  }

  return queue;
}

let lastPlanSignature = null;

function generatePlan({ newSeed = false } = {}) {
  let routines;
  let planSignature;
  let attempts = 0;
  do {
    if (newSeed || attempts > 0) {
      activeSeed = createSeed();
      updatePlanUrl();
    }
    resetRandom();
    const availableCardio = cardioExercises.filter((option) =>
      option.equipment.some((item) => selectedEquipment.has(item)),
    );
    const cardioName = () => shuffle(availableCardio)[0] || null;
    const blueprintQueue = buildBlueprintQueue();
    const hasCardio = cardioEnabled();
    const fourExerciseOffset = hasCardio ? (seededRandom() < 0.5 ? 0 : 1) : null;
    const targetExerciseCounts = Array.from({ length: sessionCount }, (_, index) => (
      hasCardio && index % 2 === fourExerciseOffset ? 4 : 5
    ));
    const coverageMusclePlan = buildCoverageMusclePlan(targetExerciseCounts);
    let previousExerciseIds = [];
    routines = Array.from({ length: sessionCount }, (_, index) => {
      const blueprint = blueprintQueue[index];
      const targetExerciseCount = targetExerciseCounts[index];
      const routine = buildRoutine(
        blueprint,
        index + 1,
        previousExerciseIds,
        targetExerciseCount,
        coverageMusclePlan[index],
      );
      routine.cardio = hasCardio && targetExerciseCount === 4
        ? cardioName()
        : null;
      routine.cardioMinutes = routine.cardio ? cardioDurationMinutes(routine.cardio) : 0;
      routine.minutes = routine.liftingMinutes + routine.cardioMinutes;
      previousExerciseIds = routine.exercises.map((exercise) => exercise.id);
      return routine;
    });
    planSignature = routines.map((routine) => [
      routine.exercises.map((exercise) => exercise.id).join(","),
      routine.warmups.map((warmup) => warmup.id).join(","),
      routine.cardio?.name || "",
    ].join("|")).join(";");
    attempts += 1;
  } while (newSeed && planSignature === lastPlanSignature && attempts < 8);

  lastPlanSignature = planSignature;
  const routineMarkup = routines.map(renderRoutine).join("");
  output.innerHTML = `<div class="routine-grid">${routineMarkup}</div>`;
}

function updateEquipmentState(button) {
  const equipment = button.dataset.equipment;
  if (selectedEquipment.has(equipment)) {
    if (selectedEquipment.size === 1) return false;
    if (primaryLiftingEquipment.has(equipment)
      && ![...selectedEquipment].some((item) => item !== equipment && primaryLiftingEquipment.has(item))) return false;
    selectedEquipment.delete(equipment);
    if (equipment === "bar") {
      selectedEquipment.delete("landmine");
      selectedEquipment.delete("rack");
    }
  } else {
    const addWithDependencies = (item) => {
      selectedEquipment.add(item);
      equipmentDependencies.get(item)?.forEach(addWithDependencies);
    };
    addWithDependencies(equipment);
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

let sharePopoverTimeout;

shareButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    sharePopover.classList.add("is-visible");
    window.clearTimeout(sharePopoverTimeout);
    sharePopoverTimeout = window.setTimeout(() => sharePopover.classList.remove("is-visible"), 1600);
  } catch (error) {
    console.warn("Unable to copy plan link", error);
  }
});
function closeMobileMenu() {
  mobileMenu.classList.remove("is-open");
  menuBackdrop.classList.remove("is-visible");
  document.body.classList.remove("menu-is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open menu");
}
menuButton.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("is-open");
  menuBackdrop.classList.toggle("is-visible", isOpen);
  document.body.classList.toggle("menu-is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});
menuClose.addEventListener("click", closeMobileMenu);
menuBackdrop.addEventListener("click", closeMobileMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileMenu();
});
mobileMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
  if (!action) return;
  closeMobileMenu();
  if (action === "info") infoModal.showModal();
  if (action === "progression") progressionModal.showModal();
  if (action === "config") configModal.showModal();
  if (action === "legal") legalModal.showModal();
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
dynamicWarmupToggle.addEventListener("change", () => {
  dynamicWarmups = dynamicWarmupToggle.checked;
  updatePlanUrl();
  generatePlan();
});
dynamicRestToggle.addEventListener("change", () => {
  dynamicRest = dynamicRestToggle.checked;
  updatePlanUrl();
  generatePlan();
});

syncEquipmentButtons();
updateSessionControls();
generatePlan();
window.addEventListener("load", () => {
  if (!loadedFromSeed) document.querySelector(".cards-actions").scrollIntoView({ behavior: "auto", block: "start" });
});
}

startApp().catch((error) => {
  console.error(error);
  document.querySelector("#routine-output").textContent = "Unable to load the workout catalog. Please refresh the page.";
});
