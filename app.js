import { HevyApiError, HevyClient, listAllPages } from "./hevy-client.js";
import { buildExportId, buildHevyFolderRequest, buildHevyRoutineRequests, validateHevyExport } from "./hevy-export.js";
import { calculateRoutineMinutes, calculateRoutineSeconds } from "./routine-timing.js";

async function startApp() {
  const loadJson = (file) => fetch(`./${file}?v=20260984`).then((response) => {
    if (!response.ok) throw new Error(`Unable to load workout data (${response.status})`);
    return response.json();
  });
  const [
    { exercises },
    { coverageCycle },
    { equipment: equipmentCatalog },
    hevyMappings,
  ] = await Promise.all([
    loadJson("exercises.json"),
    loadJson("data.json"),
    loadJson("equipment.json"),
    loadJson("hevy-mappings.json"),
  ]);

const equipmentButtons = [...document.querySelectorAll("[data-equipment]")];
const countLabel = document.querySelector("#selection-count");
const output = document.querySelector("#routine-output");
const routineStatus = document.querySelector("#routine-status");
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
const exerciseDetailModal = document.querySelector("#exercise-detail-modal");
const exerciseDetailClose = document.querySelector("#exercise-detail-close");
const exerciseDetailName = document.querySelector("#exercise-detail-name");
const exerciseDetailMeta = document.querySelector("#exercise-detail-meta");
const exerciseDetailContent = document.querySelector("#exercise-detail-content");
const exerciseDetailExclude = document.querySelector("#exercise-detail-exclude");
const excludedExerciseList = document.querySelector("#excluded-exercise-list");
const excludedExerciseCount = document.querySelector("#excluded-exercise-count");
const clearExclusionsButton = document.querySelector("#clear-exclusions");
const planToast = document.querySelector("#plan-toast");
const planToastMessage = document.querySelector("#plan-toast-message");
const planToastUndo = document.querySelector("#plan-toast-undo");
const planActionsButton = document.querySelector("#plan-actions-button");
const planActionsMenu = document.querySelector("#plan-actions-menu");
const planActionsBackdrop = document.querySelector("#plan-actions-backdrop");
const planActionStatus = document.querySelector("#plan-action-status");
const sendHevyAction = document.querySelector('[data-plan-action="send-hevy"]');
const cardsActions = document.querySelector(".cards-actions");
const regenerateButton = document.querySelector("#regenerate-button");
const menuButton = document.querySelector("#menu-button");
const mobileMenu = document.querySelector("#mobile-menu");
const menuClose = document.querySelector("#menu-close");
const menuBackdrop = document.querySelector("#menu-backdrop");
const themeToggles = [...document.querySelectorAll("[data-theme-toggle]")];
const legalButton = document.querySelector("#legal-button");
const legalModal = document.querySelector("#legal-modal");
const legalClose = document.querySelector("#legal-close");
const sessionOptions = [4, 8, 12, 16];
const FIXED_REST_PERIODS = [90, 60];
const PRIMARY_REST_PERIOD = 120;
const ROUTINE_TRANSITION_SECONDS = 120;
const TARGET_LIFTING_SECONDS = 29 * 60;
const MAX_LIFTING_SECONDS = 30 * 60;
const MAX_ROUTINE_CANDIDATES = 96;
const MAX_UNILATERAL_EXERCISES = 2;
const SECONDARY_WARMUP_RECOVERY_SECONDS = 30;
const SECONDARY_WARMUP_DOSE = "W × 5–8 × 50%";
const SECONDARY_PULL_WARMUP_DOSE = "W × 3–5 assisted";

if (cardsActions && regenerateButton) cardsActions.insertBefore(regenerateButton, cardsActions.firstChild);
const COVERAGE_MUSCLES = ["shoulders", "biceps", "triceps", "back", "chest", "quads", "hamstrings", "calves"];
const PRIMARY_COVERAGE_MUSCLES = ["shoulders", "back", "chest", "quads", "hamstrings"];
const equipmentLabels = new Map(equipmentCatalog.flatMap((item) => [
  [item.key, item.label],
  ...(item.aliases || []).map((alias) => [alias, item.label]),
]));
const primaryLiftingEquipment = new Set(equipmentCatalog.filter((item) => item.group === "primary").map((item) => item.key));
const cardioEquipment = new Set(equipmentCatalog.filter((item) => item.group === "cardio").map((item) => item.key));
const conditioningEquipment = new Set(equipmentCatalog.filter((item) => item.group === "conditioning").map((item) => item.key));
const planParams = new URLSearchParams(window.location.search);
const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
const exerciseCatalogById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const equipmentGroupGrids = new Map(
  [...document.querySelectorAll("[data-equipment-group]")].map((section) => [
    section.dataset.equipmentGroup,
    section.querySelector(".equipment-grid"),
  ]),
);
equipmentCatalog.forEach((equipment) => {
  let button = equipmentButtons.find((item) => item.dataset.equipment === equipment.key);
  if (!button) {
    button = document.createElement("button");
    button.className = "equipment-card";
    button.type = "button";
    button.dataset.equipment = equipment.key;
    button.innerHTML = `<span class="equipment-icon body-icon" aria-hidden="true"><span></span><i></i><b></b></span><span class="equipment-name"></span><span class="equipment-detail"></span><span class="check" aria-hidden="true">✓</span>`;
    equipmentButtons.push(button);
  }
  button.querySelector(".equipment-name").textContent = equipment.label;
  button.querySelector(".equipment-detail").textContent ||= equipment.group === "cardio" ? "Cardio equipment" : `${equipment.group} equipment`;
});
equipmentButtons.forEach((button) => {
  const equipment = equipmentCatalog.find((item) => item.key === button.dataset.equipment);
  equipmentGroupGrids.get(equipment?.group)?.append(button);
});

function decodeBase36BigInt(value) {
  let result = 0n;
  for (const character of value.toLowerCase()) {
    const digit = "0123456789abcdefghijklmnopqrstuvwxyz".indexOf(character);
    if (digit < 0) return null;
    result = result * 36n + BigInt(digit);
  }
  return result;
}

function decodeExcludedExercises(value) {
  if (!value) return [];
  return value.split(",").map((id) => id.trim()).filter((id) => exerciseIds.has(id));
}

const excludedExerciseIds = new Set(decodeExcludedExercises(planParams.get("exclude")));
const isExcluded = (exercise) => excludedExerciseIds.has(exercise.id);
const strengthExercises = exercises.filter((exercise) => exercise.type === "strength");
const cardioExercises = exercises.filter((exercise) => exercise.type === "cardio");

function availableCardioAfterExclusion(exerciseId) {
  return cardioExercises.filter((exercise) =>
    exercise.id !== exerciseId &&
    !isExcluded(exercise) &&
    exercise.equipment.some((item) => selectedEquipment.has(item)),
  );
}
const universalWarmupSets = new Map();
exercises.filter((exercise) => exercise.type === "warmup" && exercise.isUniversal)
  .forEach((exercise) => {
    const set = universalWarmupSets.get(exercise.universalSet) || [];
    set.push(exercise);
    universalWarmupSets.set(exercise.universalSet, set);
  });
const equipmentDependencies = new Map(equipmentCatalog.map((item) => [item.key, item.dependencies || []]));
const defaultEquipment = equipmentCatalog.filter((item) => item.isDefault).map((item) => item.key);
const equipmentKeys = equipmentCatalog.map((item) => item.key);

const duplicateExerciseIds = exercises
  .map((exercise) => exercise.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
const equipmentReferences = new Set(equipmentCatalog.flatMap((item) => [item.key, ...(item.aliases || [])]));
const catalogErrors = [
  duplicateExerciseIds.length ? `duplicate exercise IDs: ${[...new Set(duplicateExerciseIds)].join(", ")}` : "",
  equipmentCatalog.some((item) => !item.key || !item.group || !Array.isArray(item.dependencies)) ? "invalid equipment record" : "",
  exercises.some((exercise) => !exercise.id || !Array.isArray(exercise.equipment)) ? "invalid exercise record" : "",
  exercises.some((exercise) => [...(exercise.equipment || []), ...(exercise.requires || [])]
    .some((item) => item !== "bodyweight" && !equipmentReferences.has(item))) ? "unknown exercise equipment reference" : "",
  exercises.some((exercise) => !exercise.instructions?.length) ? "exercise instructions missing" : "",
  !Array.isArray(coverageCycle) || coverageCycle.length !== 4 ? "coverage cycle must contain four routines" : "",
].filter(Boolean);
if (catalogErrors.length) throw new Error(`Workout catalog validation failed: ${catalogErrors.join("; ")}`);

function resolveEquipmentDependencies(equipment) {
  const resolved = new Set(equipment);
  let changed = true;
  while (changed) {
    changed = false;
    equipmentCatalog.forEach((item) => {
      if (resolved.has(item.key) && item.dependencies.some((dependency) => !resolved.has(dependency))) {
        resolved.delete(item.key);
        changed = true;
      }
    });
  }
  return [...resolved];
}

function parseSessionCount(value) {
  const parsed = Number(value);
  return sessionOptions.includes(parsed) ? parsed : 4;
}

function decodePlanSeed(token) {
  const parts = token?.split(".");
  if (!parts || parts.length !== 8 || !parts[0] || !["0", "1"].includes(parts[2])) return null;
  if (parts[7] !== "7" || !["0", "1"].includes(parts[5]) || !["0", "1"].includes(parts[6]) || !["d", "l"].includes(parts[4])) return null;
  const equipmentMask = decodeBase36BigInt(parts[3]);
  if (equipmentMask === null) return null;
  const equipment = resolveEquipmentDependencies(equipmentKeys.filter((key, index) => (equipmentMask & (1n << BigInt(index))) !== 0n));
  if (!equipment.length) return null;
  if ((parts[2] === "1") !== equipment.some((item) => cardioEquipment.has(item))) return null;
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
let selectedEquipment = new Set(resolveEquipmentDependencies(decodedPlan?.equipment || defaultEquipment));
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
  const equipmentMask = [...selectedEquipment].reduce((mask, equipment) => mask | (1n << BigInt(equipmentKeys.indexOf(equipment))), 0n);
  const themeCode = document.documentElement.dataset.theme === "light" ? "l" : "d";
  return `${activeSeed}.${sessionCount}.${cardioEnabled() ? "1" : "0"}.${equipmentMask.toString(36)}.${themeCode}.${dynamicWarmups ? "1" : "0"}.${dynamicRest ? "1" : "0"}.7`;
}

function updatePlanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", encodePlanSeed());
  const encodedExclusions = [...excludedExerciseIds].sort().join(",");
  if (encodedExclusions) url.searchParams.set("exclude", encodedExclusions);
  else url.searchParams.delete("exclude");
  url.searchParams.delete("sessions");
  url.searchParams.delete("equipment");
  url.searchParams.delete("cardio");
  url.hash = "";
  window.history.replaceState({}, "", url);
}

let activeSeed = decodedPlan?.seed || createSeed();
updatePlanUrl();

function planSeedMaterial() {
  return `${activeSeed}:${sessionCount}:${[...selectedEquipment].sort().join(",")}:${[...excludedExerciseIds].sort().join(",")}:${cardioEnabled() ? "1" : "0"}:${dynamicWarmups ? "1" : "0"}:${dynamicRest ? "1" : "0"}`;
}

let randomState = hashSeed(planSeedMaterial());
const sunIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>';
const moonIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3 8.5 8.5 0 1 0 20.7 15.3z" /></svg>';
function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#1f2428" : "#f5f4ef");
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

function resetRandom(attempt = 0) {
  const material = attempt ? `${planSeedMaterial()}:${attempt}` : planSeedMaterial();
  randomState = hashSeed(material);
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
  return exercise.repUnit === "per side" ? `${range} / side` : range;
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

let currentExerciseDetails = new Map();
let activeDetailExerciseId = null;
let previousDetailTarget = null;
let exclusionToastTimeout;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return equipment.length
    ? equipment.map((item) => equipmentLabels.get(item) || item)
    : ["No equipment required"];
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
  const warmupSets = exercise.primary || hasPowerPrep
    ? exerciseWarmupSets(exercise)
    : (exercise.secondaryWarmupSets || []);
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
  const standardProgression = [
    "Use one working weight for all three sets.",
    "Complete as many clean reps as possible within the assigned range without sacrificing form.",
    "Keep the weight until every set reaches the top of the range, then increase the weight the next time the exercise appears.",
  ].join(paragraphBreak);
  return withSideNote(standardProgression);
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
    if (usesLoadedBar(exercise.setup) && usesLoadedBar(partner.setup)) return true;
    const exerciseResources = exercise.setupResources || [];
    const partnerResources = partner.setupResources || [];
    return exerciseResources.some((resource) => partnerResources.some((partnerResource) => {
      if (resource.startsWith("bench-") && partnerResource.startsWith("bench-")) {
        return true;
      }
      return ["rack", "landmine", "band-anchor", "olympic-bar", "ez-bar", "trap-bar"].includes(resource)
        && resource === partnerResource;
    }));
  });
}

function isBodyweightOnly(exercise) {
  return exercise.equipment.includes("bodyweight") && exercise.equipment.every((item) => item === "bodyweight" || item === "bench");
}

function selectedEquipmentSupportsPrimaryMuscle(muscle) {
  return strengthExercises.some((exercise) => exercise.primaryMuscle === muscle
    && exercise.primaryEligible
    && !isExcluded(exercise)
    && matchesSelectedEquipment(exercise)
    && !isBodyweightOnly(exercise)
    && !exercise.conditioning);
}

function selectedEquipmentSupportsMuscle(muscle) {
  return strengthExercises.some((exercise) => exercise.primaryMuscle === muscle
    && !isExcluded(exercise)
    && matchesSelectedEquipment(exercise)
    && !isBodyweightOnly(exercise)
    && !exercise.conditioning);
}

function unsupportedCoverageMuscles() {
  return COVERAGE_MUSCLES.filter((muscle) => PRIMARY_COVERAGE_MUSCLES.includes(muscle)
    ? !selectedEquipmentSupportsPrimaryMuscle(muscle)
    : !selectedEquipmentSupportsMuscle(muscle));
}

function exerciseCandidates(muscle, supersetExercises = [], exerciseIndex, recentExerciseIds = [], routineExercises = []) {
  const muscleExercises = strengthExercises.filter((exercise) => exercise.primaryMuscle === muscle && !isExcluded(exercise));
  const matchingExercises = muscleExercises.filter(matchesSelectedEquipment);
  const weightedExercises = matchingExercises.filter((exercise) => !isBodyweightOnly(exercise) && !exercise.conditioning);
  const primaryExercises = matchingExercises.filter((exercise) => exercise.primaryEligible && !exercise.conditioning);
  const pools = exerciseIndex === 0 ? [primaryExercises] : [weightedExercises];
  const recentIds = new Set(recentExerciseIds);

  const compatibleExercises = (pool) => shuffle(pool).filter((exercise) =>
    !routineExercises.some((routineExercise) => routineExercise.id === exercise.id)
      && !setupsConflict(exercise, supersetExercises)
      && (!exercise.unilateral
        || routineExercises.filter((routineExercise) => routineExercise.unilateral).length < MAX_UNILATERAL_EXERCISES),
  );

  return [...new Map(pools
    .flatMap((pool) => compatibleExercises(pool))
    .sort((first, second) => Number(recentIds.has(first.id)) - Number(recentIds.has(second.id)))
    .map((exercise) => [exercise.id, exercise])).values()];
}

function finalExerciseCandidates(preferredMuscle, supersetExercises = [], recentExerciseIds = [], routineExercises = []) {
  const candidates = strengthExercises
    .filter((exercise) => !isExcluded(exercise))
    .filter(matchesSelectedEquipment)
    .filter((exercise) => !routineExercises.some((routineExercise) => routineExercise.id === exercise.id))
    .filter((exercise) => exercise.primaryMuscle === "core"
      || isBodyweightOnly(exercise)
      || exercise.conditioning
      || exercise.equipment.some((item) => conditioningEquipment.has(item)))
    .map((exercise) => ({ ...exercise, muscle: exercise.primaryMuscle }));
  const preferred = preferredMuscle === "core"
    ? candidates.filter((exercise) => exercise.muscle === "core")
    : [];
  const coreCandidates = candidates.filter((exercise) => exercise.muscle === "core");
  const conditioningCandidates = candidates.filter((exercise) => exercise.conditioning);
  const bodyweightCandidates = candidates.filter((exercise) => isBodyweightOnly(exercise));
  const useConditioning = conditioningCandidates.length > 0 && seededRandom() < 0.35;
  const pools = useConditioning
    ? [conditioningCandidates, coreCandidates, bodyweightCandidates, candidates]
    : preferred.length
      ? [preferred, conditioningCandidates, bodyweightCandidates, candidates]
      : [coreCandidates, conditioningCandidates, bodyweightCandidates, candidates];
  const recentIds = new Set(recentExerciseIds);
  const compatibleExercises = (pool, avoidRecent) => shuffle(pool).filter((exercise) =>
    (!avoidRecent || !recentIds.has(exercise.id))
      && !setupsConflict(exercise, supersetExercises)
      && (!exercise.unilateral
        || routineExercises.filter((routineExercise) => routineExercise.unilateral).length < MAX_UNILATERAL_EXERCISES),
  );

  return [...new Map(pools
    .flatMap((pool) => [
      ...compatibleExercises(pool, true),
      ...compatibleExercises(pool, false),
    ])
    .map((exercise) => [exercise.id, exercise])).values()];
}

function movementPatternsMatch(firstPattern, secondPattern) {
  if (!firstPattern || !secondPattern) return false;
  if (firstPattern === secondPattern) return true;
  return firstPattern.endsWith("-push") && secondPattern.endsWith("-push");
}

function secondaryWarmupScore(exercise) {
  const name = exercise.name.toLowerCase();
  let score = 0;
  if (["quads", "hamstrings"].includes(exercise.primaryMuscle)) score += 100;
  if (["bar", "trapbar", "landmine"].some((item) => exercise.equipment.includes(item))) score += 40;
  if (exercise.setupResources?.some((resource) => ["rack", "landmine", "trap-bar"].includes(resource))) score += 20;
  if (/pull-up|chin-up/.test(name)) score += 15;
  if (exercise.equipment.includes("dumbbells")) score += 10;
  return score;
}

function chooseSecondaryWarmup(exercises) {
  const preparedPatterns = exercises.slice(0, 2).map((exercise) => exercise.movementPattern);
  const candidates = exercises.slice(2)
    .filter((exercise) => exercise.secondaryWarmupEligible)
    .filter((exercise) => !preparedPatterns.some((pattern) => movementPatternsMatch(pattern, exercise.movementPattern)))
    .sort((first, second) => secondaryWarmupScore(second) - secondaryWarmupScore(first));
  return candidates[0] || null;
}

function universalWarmupsForRoutine(sequenceNumber) {
  return (universalWarmupSets.get((sequenceNumber - 1) % 4) || []).filter((warmup) => !isExcluded(warmup));
}

function finalizeRoutineCandidate(sequenceNumber, sourceExercises) {
  const baseExercises = sourceExercises.map((exercise, index) => ({
    ...exercise,
    sets: 3,
    primary: index === 0,
    secondaryWarmupSets: undefined,
  }));
  const secondaryWarmup = chooseSecondaryWarmup(baseExercises);
  const exercises = baseExercises.map((exercise) => exercise.id === secondaryWarmup?.id
    ? {
      ...exercise,
      secondaryWarmupSets: [
        /pull-up|chin-up/i.test(exercise.name) ? SECONDARY_PULL_WARMUP_DOSE : SECONDARY_WARMUP_DOSE,
      ],
    }
    : exercise);
  const warmupTargets = shuffle(exercises.slice(0, 4)).slice(0, Math.min(3, exercises.length));
  const matchedWarmups = dynamicWarmups ? chooseWarmups(warmupTargets) : [];
  const warmups = dynamicWarmups
    ? matchedWarmups.flatMap((warmup, index) => warmup
      ? [{ ...warmup, muscle: warmupTargets[index].muscle }]
      : [])
    : universalWarmupsForRoutine(sequenceNumber).map((warmup) => ({ ...warmup, muscle: "full body" }));
  if (exercises.length > 4) {
    const warmedExerciseIds = new Set(warmupTargets.map((exercise) => exercise.id));
    const optionalExercise = shuffle(exercises.filter((exercise) => !warmedExerciseIds.has(exercise.id)))[0]
      || shuffle(exercises)[0];
    const optionalWarmup = chooseWarmups([optionalExercise], warmups.map((warmup) => warmup.id))[0];
    if (optionalWarmup) warmups.push({ ...optionalWarmup, muscle: optionalExercise.muscle, optional: true });
  }
  const restPeriods = supersetRestPeriods(exercises);
  const liftingSeconds = calculateRoutineSeconds({
    exercises,
    warmups,
    restPeriods,
    transitionSeconds: ROUTINE_TRANSITION_SECONDS,
    preparationRecoverySeconds: SECONDARY_WARMUP_RECOVERY_SECONDS,
  });
  return {
    sequenceNumber,
    exercises,
    warmups,
    totalSets: exercises.reduce((total, exercise) => total + exercise.sets, 0),
    restPeriods,
    liftingSeconds,
    liftingMinutes: calculateRoutineMinutes({
      exercises,
      warmups,
      restPeriods,
      transitionSeconds: ROUTINE_TRANSITION_SECONDS,
      preparationRecoverySeconds: SECONDARY_WARMUP_RECOVERY_SECONDS,
    }),
    cardioMinutes: 0,
    minutes: calculateRoutineMinutes({
      exercises,
      warmups,
      restPeriods,
      transitionSeconds: ROUTINE_TRANSITION_SECONDS,
      preparationRecoverySeconds: SECONDARY_WARMUP_RECOVERY_SECONDS,
    }),
  };
}

function candidatePreference(first, second) {
  const firstTarget = first.liftingSeconds <= TARGET_LIFTING_SECONDS;
  const secondTarget = second.liftingSeconds <= TARGET_LIFTING_SECONDS;
  if (firstTarget !== secondTarget) return firstTarget ? -1 : 1;
  return first.liftingSeconds - second.liftingSeconds;
}

function buildRoutine(sequenceNumber, recentExerciseIds = [], targetExerciseCount = 4, targetMuscles = []) {
  // The first four slots are required lifting work. A fifth slot is optional
  // and is kept only when the complete routine remains within the time limit.
  const liftingMuscles = targetMuscles.slice(0, 4);
  const baseCombinations = [];
  const collectBaseCombinations = (index, built) => {
    if (baseCombinations.length >= MAX_ROUTINE_CANDIDATES) return;
    if (index === liftingMuscles.length) {
      baseCombinations.push(built);
      return;
    }
    const supersetStart = index < 2 ? 0 : 2;
    const candidates = exerciseCandidates(
      liftingMuscles[index],
      built.slice(supersetStart),
      index,
      recentExerciseIds,
      built,
    );
    candidates.forEach((exercise) => {
      if (baseCombinations.length >= MAX_ROUTINE_CANDIDATES) return;
      collectBaseCombinations(index + 1, [
        ...built,
        { ...exercise, muscle: liftingMuscles[index] },
      ]);
    });
  };
  collectBaseCombinations(0, []);
  if (!baseCombinations.length) return null;

  const baseCandidates = baseCombinations
    .map((exercises) => finalizeRoutineCandidate(sequenceNumber, exercises))
    .filter((candidate) => candidate.liftingSeconds <= MAX_LIFTING_SECONDS)
    .sort(candidatePreference);
  if (!baseCandidates.length) return null;
  if (targetExerciseCount !== 5) return baseCandidates[0];

  const fiveExerciseCandidates = [];
  baseCandidates.forEach((baseCandidate) => {
    const finalCandidates = finalExerciseCandidates(
      targetMuscles.includes("core") ? "core" : null,
      baseCandidate.exercises.slice(2),
      recentExerciseIds,
      baseCandidate.exercises,
    );
    finalCandidates.forEach((exercise) => {
      if (fiveExerciseCandidates.length >= MAX_ROUTINE_CANDIDATES) return;
      const candidate = finalizeRoutineCandidate(sequenceNumber, [
        ...baseCandidate.exercises,
        { ...exercise, muscle: exercise.primaryMuscle },
      ]);
      if (candidate.liftingSeconds <= MAX_LIFTING_SECONDS) fiveExerciseCandidates.push(candidate);
    });
  });
  fiveExerciseCandidates.sort(candidatePreference);
  // The fifth exercise is a maximum, not a requirement. If it cannot fit,
  // preserve the valid four-exercise base routine and its twelve sets.
  return fiveExerciseCandidates[0] || baseCandidates[0];
}

function buildCoverageMusclePlan(routineExerciseCounts) {
  const muscleSets = routineExerciseCounts.map((exerciseCount, index) => {
    const cycleSet = shuffle(coverageCycle[index % coverageCycle.length]);
    return exerciseCount === 5 ? [...cycleSet, "core"] : cycleSet;
  });
  const primaryMuscles = muscleSets.map((muscles) => {
    const candidates = muscles.filter((muscle) => selectedEquipmentSupportsPrimaryMuscle(muscle));
    return candidates.length ? shuffle(candidates)[0] : muscles[0];
  });
  for (let index = 1; index < primaryMuscles.length; index += 1) {
    if (primaryMuscles[index] !== primaryMuscles[index - 1]) continue;
    const replacement = muscleSets[index]
        .filter((muscle) => selectedEquipmentSupportsPrimaryMuscle(muscle) && muscle !== primaryMuscles[index - 1])
      .find((muscle) => muscle !== primaryMuscles[index - 2]);
    if (replacement) primaryMuscles[index] = replacement;
  }
  if (primaryMuscles.length > 1 && primaryMuscles.at(-1) === primaryMuscles[0]) {
    const lastCandidates = muscleSets.at(-1)
      .filter((muscle) => selectedEquipmentSupportsPrimaryMuscle(muscle)
        && muscle !== primaryMuscles.at(-2)
        && muscle !== primaryMuscles[0]);
    if (lastCandidates.length) primaryMuscles[primaryMuscles.length - 1] = lastCandidates[0];
  }
  return muscleSets.map((muscles, index) => {
    const primaryMuscle = primaryMuscles[index];
    return [primaryMuscle, ...muscles.filter((muscle) => muscle !== primaryMuscle)];
  });
}

function warmupCandidates(muscle) {
  const candidates = exercises.filter((exercise) => exercise.type === "warmup"
    && exercise.primaryMuscle === muscle
    && !isExcluded(exercise));
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
    const repetitions = /^\d+$/.test(String(interval.sets)) ? Number(interval.sets) : 1;
    return total + repetitions * (interval.duration.includes("sec") ? duration / 60 : duration);
  }, 0) || 0;
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
    const groupLabel = "Superset";
    const rest = formatRest(restPeriods[groupIndex]);
    const groupExercises = group.map((exercise) => {
      const exerciseIndex = routine.exercises.indexOf(exercise);
      const hasPowerPrep = exercise.conditioning && exercise.warmupProtocol === "powerPrep";
      const preparationSets = exercise.primary || hasPowerPrep
        ? exerciseWarmupSets(exercise)
        : (exercise.secondaryWarmupSets || []);
      const primarySets = [...preparationSets, `${exercise.sets} × ${exerciseRepRange(exercise)}`];
      return `
        <div class="exercise exercise-row-interactive" ${interactiveAttributes(exercise, `routine-${routine.sequenceNumber}:exercise-${exerciseIndex}-${exercise.id}`)}>
          <span><span class="exercise-name">${exerciseDisplayName(exercise)}</span><span class="exercise-muscle">${exerciseDescriptor(exercise, exercise.muscle)}</span></span>
          <span class="exercise-sets${primarySets.length > 1 ? " stacked-sets" : ""}">${primarySets.map((set, index) => `<span class="${index < preparationSets.length ? "exercise-warmup-set" : "exercise-working-set"}">${set}</span>`).join("")}</span>
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
        <div class="routine-title-row"><h2>Routine ${String(routine.sequenceNumber).padStart(2, "0")}</h2><span class="routine-duration${routine.liftingMinutes > 30 ? " is-over-target" : ""}"><span>${routine.liftingMinutes}′</span>${routine.cardio ? `<span class="routine-duration-divider" aria-hidden="true"><svg viewBox="0 0 4 32"><path d="M2 1v30" /></svg></span><span class="routine-cardio-duration">${routine.cardioMinutes}′</span>` : ""}</span></div>
      </div>
      <div class="exercise-list">${warmupMarkup}${exerciseMarkup}${routine.cardio ? `<div class="superset cardio-block"><div class="superset-heading"><span>Cardio finisher</span></div><div class="exercise cardio-exercise exercise-row-interactive" ${interactiveAttributes(routine.cardio, `routine-${routine.sequenceNumber}:cardio-${routine.cardio.id}`)}><span><span class="exercise-name">${routine.cardio.name}</span><span class="exercise-muscle">cardio - conditioning</span></span><span class="exercise-sets cardio-sets">${routine.cardio.timing.map((interval) => `<span class="${interval.sets === "W" ? "cardio-warmup-set" : "cardio-working-set"}">${interval.sets} × ${interval.duration}</span>`).join("")}</span></div></div>` : ""}</div>
    </article>`;
}

let lastPlanSignature = null;
let currentRoutines = [];
let currentPlanRoutines = [];
let hevyClient = null;
let hevyExportState = null;

function updateHevyActionState() {
  if (sendHevyAction) sendHevyAction.disabled = currentPlanRoutines.length === 0;
}

const hevyModal = document.querySelector("#hevy-modal");
const hevyClose = document.querySelector("#hevy-close");
const hevyModalContent = document.querySelector("#hevy-modal-content");

function hevyErrorMessage(error) {
  if (error?.code === "auth") return "That Hevy API key was not accepted.";
  if (error?.code === "network") return navigator.onLine === false
    ? "Unable to reach Hevy. Check your connection and try again."
    : "Hevy blocked this browser request. Direct integration is not currently available.";
  if (error?.code === "timeout") return "Unable to reach Hevy. Check your connection and try again.";
  if (error?.code === "rate-limit") return "Hevy is rate limiting requests. Try again in a moment.";
  return "Hevy could not complete this request. Try again.";
}

function hevyPlanSnapshot() {
  return typeof structuredClone === "function"
    ? structuredClone(currentPlanRoutines)
    : JSON.parse(JSON.stringify(currentPlanRoutines));
}

function hevyPlanSummary() {
  const routines = currentPlanRoutines;
  return {
    routines: routines.length,
    exercises: routines.reduce((total, routine) => total + routine.exercises.length, 0),
    cardio: routines.filter((routine) => routine.cardio).length,
  };
}

function hevyFolderTitle() {
  return `2–5–15–30 · Plan ${activeSeed.slice(0, 6)}`;
}

function renderHevyConnection() {
  hevyModalContent.innerHTML = `<form class="hevy-form" id="hevy-connect-form">
    <p class="info-modal-lede">Connect a Hevy Pro account to send the current routines. The API key is sent directly to Hevy and is not stored by 2–5–15–30.</p>
    <label class="hevy-field" for="hevy-api-key"><strong>Hevy API key</strong><input id="hevy-api-key" type="password" autocomplete="off" spellcheck="false" required /></label>
    <p class="hevy-help"><a href="https://hevy.com/settings?developer" target="_blank" rel="noreferrer">Get a Hevy API key</a></p>
    <p class="hevy-pro-note">The public Hevy API currently requires Hevy Pro.</p>
    <p class="hevy-error" id="hevy-error" role="alert" hidden></p>
    <div class="hevy-dialog-actions"><button class="text-button" id="hevy-cancel" type="button">Cancel</button><button class="primary-button" id="hevy-connect" type="submit">Connect</button></div>
  </form>`;
  const form = document.querySelector("#hevy-connect-form");
  const input = document.querySelector("#hevy-api-key");
  const errorBox = document.querySelector("#hevy-error");
  const connectButton = document.querySelector("#hevy-connect");
  document.querySelector("#hevy-cancel").addEventListener("click", () => hevyModal.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = input.value.trim();
    if (!key) return;
    connectButton.disabled = true;
    connectButton.textContent = "Connecting…";
    errorBox.hidden = true;
    const candidate = new HevyClient(key);
    try {
      await candidate.getUserInfo();
      hevyClient = candidate;
      renderHevyConfirmation();
    } catch (error) {
      errorBox.textContent = hevyErrorMessage(error);
      errorBox.hidden = false;
      connectButton.disabled = false;
      connectButton.textContent = "Connect";
    }
  });
  input.focus();
}

function renderHevyConfirmation(message = "") {
  const summary = hevyPlanSummary();
  const validation = validateHevyExport(currentPlanRoutines, hevyMappings);
  const missingMarkup = validation.valid ? "" : `<div class="hevy-error" role="alert"><strong>Mapping required before export</strong><p>This plan contains exercises that are not yet mapped to Hevy:</p><ul>${validation.missing.map((exercise) => `<li>${escapeHtml(exercise.name)}</li>`).join("")}</ul></div>`;
  hevyModalContent.innerHTML = `<div class="hevy-confirmation">
    <p class="info-modal-lede">Send ${summary.routines} routines to Hevy?</p>
    <label class="hevy-field" for="hevy-folder-title"><strong>Folder</strong><input id="hevy-folder-title" type="text" value="${escapeHtml(hevyFolderTitle())}" maxlength="80" /></label>
    <div class="hevy-summary"><strong>${summary.routines} routines</strong><strong>${summary.exercises} exercises</strong><strong>${summary.cardio} cardio finishers</strong></div>
    ${missingMarkup}
    ${message ? `<p class="hevy-status" role="status">${escapeHtml(message)}</p>` : ""}
    <div class="hevy-dialog-actions"><button class="text-button" id="hevy-disconnect" type="button">Disconnect</button><button class="text-button" id="hevy-cancel" type="button">Cancel</button><button class="primary-button" id="hevy-send" type="button"${validation.valid ? "" : " disabled"}>Send routines</button></div>
  </div>`;
  document.querySelector("#hevy-cancel").addEventListener("click", () => hevyModal.close());
  document.querySelector("#hevy-disconnect").addEventListener("click", disconnectHevy);
  if (validation.valid) document.querySelector("#hevy-send").addEventListener("click", () => sendHevyRoutines(document.querySelector("#hevy-folder-title").value.trim() || hevyFolderTitle()));
}

function disconnectHevy() {
  hevyClient?.clearApiKey();
  hevyClient = null;
  hevyExportState = null;
  renderHevyConnection();
}

function renderHevyProgress(message) {
  hevyModalContent.innerHTML = `<div class="hevy-progress"><p class="info-modal-lede" role="status">${escapeHtml(message)}</p><div class="hevy-progress-bar"><span style="width:${hevyExportState ? `${(hevyExportState.createdRoutines.size / hevyExportState.total) * 100}%` : "0%"}"></span></div></div>`;
}

function renderHevyResult(message, { partial = false } = {}) {
  const created = hevyExportState?.createdRoutines.size || 0;
  const total = hevyExportState?.total || currentPlanRoutines.length;
  hevyModalContent.innerHTML = `<div class="hevy-result"><p class="info-modal-lede">${escapeHtml(message)}</p>${partial ? `<p class="hevy-error" role="alert">${created} of ${total} routines were created. Retry only the remaining routines.</p>` : ""}<div class="hevy-dialog-actions"><button class="text-button" id="hevy-disconnect" type="button">Disconnect</button>${partial ? `<button class="primary-button" id="hevy-retry" type="button">Retry remaining routines</button>` : `<button class="primary-button" id="hevy-done" type="button">Done</button>`}</div></div>`;
  document.querySelector("#hevy-disconnect").addEventListener("click", disconnectHevy);
  document.querySelector("#hevy-retry")?.addEventListener("click", () => sendHevyRoutines(hevyExportState.folderTitle, true));
  document.querySelector("#hevy-done")?.addEventListener("click", () => hevyModal.close());
}

function routineNumberFromPayload(payload) {
  return Number(payload.routine.title.match(/(\d+)$/)?.[1]);
}

function matchingPlanRoutineNumbers(routines, exportId) {
  return new Set(routines
    .filter((routine) => String(routine.notes || "").includes(`Plan ID: ${exportId}`))
    .map((routine) => Number(String(routine.notes).match(/Routine:\s*(\d+)/)?.[1]))
    .filter(Number.isInteger));
}

async function sendHevyRoutines(folderTitle, isRetry = false) {
  if (!hevyClient || !currentPlanRoutines.length) return;
  const snapshot = hevyPlanSnapshot();
  const exportId = buildExportId({
    seed: activeSeed,
    sessions: sessionCount,
    selectedEquipment,
    excludedExerciseIds,
    dynamicWarmups,
    dynamicRest,
  });
  const validation = validateHevyExport(snapshot, hevyMappings);
  if (!validation.valid) {
    renderHevyConfirmation();
    return;
  }
  const draftPayloads = buildHevyRoutineRequests({ routines: snapshot, folderId: null, exportId, mappings: hevyMappings });
  if (!isRetry) hevyExportState = { exportId, folderTitle, createdRoutines: new Map(), total: snapshot.length };
  renderHevyProgress("Checking Hevy…");
  try {
    const folders = await listAllPages((page) => hevyClient.listRoutineFolders(page, 10), "routine_folders");
    let folder = folders.find((candidate) => candidate.title === folderTitle);
    const allRoutines = await listAllPages((page) => hevyClient.listRoutines(page, 10), "routines");
    if (folder) {
      const folderRoutines = allRoutines.filter((routine) => String(routine.folder_id) === String(folder.id));
      const hasThisPlan = matchingPlanRoutineNumbers(folderRoutines, exportId).size > 0;
      if (folderRoutines.length && !hasThisPlan) folder = null;
    }
    if (!folder) {
      const suffix = folders.filter((candidate) => candidate.title === folderTitle || candidate.title.startsWith(`${folderTitle} · `)).length;
      const resolvedTitle = suffix ? `${folderTitle} · ${suffix + 1}` : folderTitle;
      hevyExportState.folderTitle = resolvedTitle;
      renderHevyProgress("Creating folder…");
      folder = await hevyClient.createRoutineFolder(buildHevyFolderRequest(resolvedTitle));
    } else {
      hevyExportState.folderTitle = folder.title;
    }
    hevyExportState.folderId = folder.id;
    const existingNumbers = matchingPlanRoutineNumbers(allRoutines.filter((routine) => String(routine.folder_id) === String(folder.id)), exportId);
    existingNumbers.forEach((number) => hevyExportState.createdRoutines.set(number, true));
    if (hevyExportState.createdRoutines.size === snapshot.length) {
      renderHevyResult("This plan has already been sent to Hevy.");
      return;
    }
    const payloads = draftPayloads.map((payload) => ({
      ...payload,
      routine: { ...payload.routine, folder_id: folder.id },
    }));
    const findExistingRoutine = async (routineNumber) => {
      const routines = await listAllPages((page) => hevyClient.listRoutines(page, 10), "routines");
      return routines.find((routine) => String(routine.folder_id) === String(folder.id)
        && String(routine.notes || "").includes(`Plan ID: ${exportId}`)
        && Number(String(routine.notes).match(/Routine:\s*(\d+)/)?.[1]) === routineNumber);
    };
    const waitBeforeRetry = async (error, attempt) => {
      const retryAfterSeconds = Number(error.retryAfter);
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.min(retryAfterSeconds * 1000, 30000)
        : Math.min(500 * (2 ** attempt), 30000);
      await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    };
    const createRoutineWithRetry = async (payload, routineNumber) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await hevyClient.createRoutine(payload);
        } catch (error) {
          if (error instanceof HevyApiError && error.code === "timeout") {
            const existingRoutine = await findExistingRoutine(routineNumber);
            if (existingRoutine) return existingRoutine;
          }
          const retryable = error instanceof HevyApiError && ["rate-limit", "server", "timeout"].includes(error.code);
          if (!retryable || attempt === 2) throw error;
          await waitBeforeRetry(error, attempt);
        }
      }
      throw new Error("Hevy routine creation did not complete.");
    };
    for (const payload of payloads) {
      const routineNumber = routineNumberFromPayload(payload);
      if (hevyExportState.createdRoutines.has(routineNumber)) continue;
      renderHevyProgress(`Creating Routine ${String(routineNumber).padStart(2, "0")} of ${String(snapshot.length).padStart(2, "0")}…`);
      const response = await createRoutineWithRetry(payload, routineNumber);
      hevyExportState.createdRoutines.set(routineNumber, response?.id || true);
    }
    renderHevyResult(`${snapshot.length} routines created in Hevy.`);
  } catch (error) {
    renderHevyResult(error instanceof HevyApiError ? hevyErrorMessage(error) : "Hevy export could not be completed.", { partial: (hevyExportState?.createdRoutines.size || 0) < snapshot.length });
  }
}

function openHevyModal() {
  if (!currentPlanRoutines.length) return;
  if (!hevyClient) renderHevyConnection();
  else renderHevyConfirmation();
  hevyModal.showModal();
}

function regenerateFromConfig() {
  const card = configModal.querySelector(".info-modal-card");
  const previousScrollTop = card?.scrollTop || 0;
  const generated = generatePlan();
  requestAnimationFrame(() => {
    if (configModal.open && card) card.scrollTop = previousScrollTop;
  });
  return generated;
}

function generatePlan({ newSeed = false } = {}) {
  const unsupportedMuscles = unsupportedCoverageMuscles();
  if (unsupportedMuscles.length) {
    currentRoutines = [];
    currentPlanRoutines = [];
    updateHevyActionState();
    output.innerHTML = `<p class="plan-error">Selected equipment cannot cover ${unsupportedMuscles.map(labelMuscle).join(", ")}. Add equipment or choose a different setup.</p>`;
    if (routineStatus) routineStatus.textContent = "Unable to generate routines for this setup";
    return false;
  }
  let routines;
  let planSignature;
  let attempts = 0;
  const maxAttempts = 8;
  do {
    planSignature = null;
    if (newSeed) {
      activeSeed = createSeed();
      updatePlanUrl();
    }
    resetRandom(attempts);
    const availableCardio = cardioExercises.filter((option) =>
      !isExcluded(option) && option.equipment.some((item) => selectedEquipment.has(item)),
    );
    const cardioName = () => shuffle(availableCardio)[0] || null;
    const hasUsableCardio = availableCardio.length > 0;
    const fourExerciseOffset = hasUsableCardio ? (seededRandom() < 0.5 ? 0 : 1) : null;
    const targetExerciseCounts = Array.from({ length: sessionCount }, (_, index) => (
      hasUsableCardio && index % 2 === fourExerciseOffset ? 4 : 5
    ));
    const coverageMusclePlan = buildCoverageMusclePlan(targetExerciseCounts);
    let previousExerciseIds = [];
    routines = Array.from({ length: sessionCount }, (_, index) => {
      const targetExerciseCount = targetExerciseCounts[index];
      const routine = buildRoutine(
        index + 1,
        previousExerciseIds,
        targetExerciseCount,
        coverageMusclePlan[index],
      );
      if (!routine) return null;
      routine.cardio = hasUsableCardio && targetExerciseCount === 4
        ? cardioName()
        : null;
      routine.cardioMinutes = routine.cardio ? cardioDurationMinutes(routine.cardio) : 0;
      routine.minutes = routine.liftingMinutes + routine.cardioMinutes;
      previousExerciseIds = routine.exercises.map((exercise) => exercise.id);
      return routine;
    });
    if (routines.some((routine) => !routine)) {
      attempts += 1;
      continue;
    }
    planSignature = routines.map((routine) => [
      routine.exercises.map((exercise) => exercise.id).join(","),
      routine.warmups.map((warmup) => warmup.id).join(","),
      routine.cardio?.name || "",
    ].join("|")).join(";");
    attempts += 1;
  } while (attempts < maxAttempts && (planSignature === null || (newSeed && planSignature === lastPlanSignature)));

  if (!routines || routines.some((routine) => !routine)) {
    currentRoutines = [];
    currentPlanRoutines = [];
    updateHevyActionState();
    output.innerHTML = `<p class="plan-error">Selected equipment cannot build the requested routine sequence. Add equipment or choose a different setup.</p>`;
    if (routineStatus) routineStatus.textContent = "Unable to generate routines for this setup";
    return false;
  }

  lastPlanSignature = planSignature;
  currentRoutines = routines;
  currentPlanRoutines = hevyPlanSnapshotFrom(routines);
  updateHevyActionState();
  currentExerciseDetails = new Map();
  routines.forEach((routine) => {
    const restPeriods = supersetRestPeriods(routine.exercises);
    routine.exercises.forEach((exercise, index) => {
      currentExerciseDetails.set(`routine-${routine.sequenceNumber}:exercise-${index}-${exercise.id}`, {
        ...exercise,
        detailRestSeconds: restPeriods[index < 2 ? 0 : 1],
      });
    });
    routine.warmups.forEach((warmup, index) => currentExerciseDetails.set(`routine-${routine.sequenceNumber}:warmup-${index}-${warmup.id}`, { ...warmup }));
    if (routine.cardio) currentExerciseDetails.set(`routine-${routine.sequenceNumber}:cardio-${routine.cardio.id}`, { ...routine.cardio });
  });
  const routineMarkup = routines.map(renderRoutine).join("");
  output.innerHTML = `<div class="routine-grid">${routineMarkup}</div>`;
  if (routineStatus) routineStatus.textContent = `${routines.length} routines generated`;
  renderExcludedExercises();
  return true;
}

function hevyPlanSnapshotFrom(routines) {
  return typeof structuredClone === "function"
    ? structuredClone(routines)
    : JSON.parse(JSON.stringify(routines));
}

function renderExcludedExercises() {
  const excluded = [...excludedExerciseIds].sort();
  excludedExerciseCount.textContent = String(excluded.length);
  clearExclusionsButton.hidden = excluded.length === 0;
  excludedExerciseList.innerHTML = excluded.length
    ? excluded.map((id) => {
      const exercise = exerciseCatalogById.get(id);
      if (!exercise) return "";
      return `<div class="excluded-exercise-row"><span><strong>${escapeHtml(exerciseDisplayName(exercise))}</strong><small>${escapeHtml(labelMuscle(exercise.primaryMuscle))}</small></span><button type="button" class="text-button" data-include-exercise="${escapeHtml(id)}">Include</button></div>`;
    }).join("")
    : "<p class=\"excluded-empty\">No exercises excluded</p>";
}

function showPlanToast(message, undoId = null) {
  planToastMessage.textContent = message;
  planToastUndo.hidden = !undoId;
  planToastUndo.dataset.undoExercise = undoId || "";
  planToast.classList.add("is-visible");
  window.clearTimeout(exclusionToastTimeout);
  exclusionToastTimeout = window.setTimeout(() => planToast.classList.remove("is-visible"), 5000);
}

function exerciseLabelById(id) {
  return exerciseDisplayName(exerciseCatalogById.get(id) || { name: id });
}

function setExerciseExclusion(id, shouldExclude) {
  if (!id) return;
  if (shouldExclude) {
    if (excludedExerciseIds.has(id)) return;
    const exercise = exerciseCatalogById.get(id);
    if (
      exercise?.type === "cardio" &&
      cardioEnabled() &&
      availableCardioAfterExclusion(id).length === 0
    ) {
      exerciseDetailExclude.checked = false;
      showPlanToast("This is the only remaining cardio workout for your selected equipment.");
      return;
    }
    excludedExerciseIds.add(id);
    if (!generatePlan()) {
      excludedExerciseIds.delete(id);
      updatePlanUrl();
      generatePlan();
      exerciseDetailExclude.checked = false;
      showPlanToast("This exercise cannot be excluded with the current equipment.");
      return;
    }
    updatePlanUrl();
    exerciseDetailModal.close();
    showPlanToast(`${exerciseLabelById(id)} excluded`, id);
    return;
  }
  if (!excludedExerciseIds.delete(id)) return;
  updatePlanUrl();
  generatePlan();
  exerciseDetailExclude.checked = false;
  exerciseDetailModal.close();
  showPlanToast(`${exerciseLabelById(id)} included`);
}

function openExerciseDetails(instanceKey, id) {
  const exercise = currentExerciseDetails.get(instanceKey) || exerciseCatalogById.get(id);
  if (!exercise) return;
  previousDetailTarget = document.activeElement;
  activeDetailExerciseId = id;
  exerciseDetailName.textContent = exerciseDisplayName(exercise);
  exerciseDetailMeta.textContent = `${labelMuscle(exercise.muscle || exercise.primaryMuscle)} · ${exerciseTypeLabel(exercise)}`;
  exerciseDetailContent.innerHTML = renderExerciseDetails(exercise);
  exerciseDetailExclude.checked = excludedExerciseIds.has(id);
  exerciseDetailModal.showModal();
}

const HEVY_CSV_HEADERS = ["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight", "Reps", "Distance", "Seconds", "Notes", "Workout Notes", "RPE"];

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseDurationSeconds(value) {
  const text = String(value ?? "");
  const clock = text.match(/(\d+):(\d+)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return "";
  if (/min/i.test(text)) return Math.round(amount * 60);
  return Math.round(amount);
}

function parseDose(dose) {
  const text = String(dose ?? "");
  const seconds = /:|sec|min/i.test(text) ? parseDurationSeconds(text) : "";
  const reps = seconds === "" ? (text.match(/\b(\d+)\b/)?.[1] || "") : "";
  return { reps, seconds };
}

function hevyTargetRange(exercise) {
  const range = exercise.durationRange || exercise.repRange || "";
  return exercise.repUnit === "per side" ? `${range} / side` : range;
}

function hevyExerciseName(exercise) {
  return exercise.hevyName || exercise.name;
}

function buildHevyExport(routines) {
  if (!Array.isArray(routines) || !routines.length) throw new Error("No generated routines are available.");
  const date = new Date().toISOString().slice(0, 10);
  const rows = [HEVY_CSV_HEADERS];
  const addRow = (routine, exercise, setOrder, values = {}) => {
    if (!exercise?.id || !exercise?.name) throw new Error("A generated exercise is missing its export mapping.");
    rows.push([
      date,
      `Routine ${String(routine.sequenceNumber).padStart(2, "0")}`,
      routine.minutes * 60,
      hevyExerciseName(exercise),
      setOrder,
      values.weight || "",
      values.reps || "",
      values.distance || "",
      values.seconds ?? "",
      values.notes || "",
      values.workoutNotes || "2–5–15–30 routine sequence",
      values.rpe || "",
    ]);
  };

  routines.forEach((routine) => {
    const groupForExercise = new Map(routine.exercises.map((exercise, index) => [exercise.id, index < 2 ? "Superset A" : "Superset B"]));
    const restForGroup = supersetRestPeriods(routine.exercises);
    const groupNote = (exercise) => {
      const group = groupForExercise.get(exercise.id);
      if (!group) return "";
      const rest = group === "Superset A" ? restForGroup[0] : restForGroup[1];
      return `${group} · Rest ${formatRestSeconds(rest)}`;
    };
    routine.warmups.forEach((warmup, index) => {
      const dose = parseDose(warmup.dose);
      addRow(routine, warmup, `W${index + 1}`, {
        reps: dose.reps,
        seconds: dose.seconds,
        notes: `Warm-up · ${warmup.dose}`,
      });
    });
    routine.exercises.forEach((exercise) => {
      const hasPowerPrep = exercise.conditioning && exercise.warmupProtocol === "powerPrep";
      const preparationSets = exercise.primary || hasPowerPrep
        ? exerciseWarmupSets(exercise)
        : (exercise.secondaryWarmupSets || []);
      preparationSets.forEach((preparationSet, index) => {
        const dose = parseDose(preparationSet);
        addRow(routine, exercise, `W${index + 1}`, {
          reps: dose.reps,
          seconds: dose.seconds,
          notes: `Warm-up · ${preparationSet} · ${groupNote(exercise)}`,
        });
      });
      const target = hevyTargetRange(exercise);
      for (let set = 1; set <= (exercise.sets || 3); set += 1) {
        addRow(routine, exercise, set, {
          reps: exercise.durationRange ? "" : target.replace("–", "-"),
          notes: `${groupNote(exercise)} · Target ${target}`.replace(/^ · /, ""),
        });
      }
    });
    if (routine.cardio) {
      routine.cardio.timing.forEach((interval, index) => {
        addRow(routine, routine.cardio, index + 1, {
          seconds: parseDurationSeconds(interval.duration),
          notes: `Cardio finisher · ${interval.sets === "W" ? "Warm-up" : "Work"} · ${interval.duration}`,
        });
      });
    }
  });
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

let planActionStatusTimeout;

function showPlanActionStatus(message, type = "success") {
  planActionStatus.textContent = message;
  planActionStatus.classList.toggle("is-error", type === "error");
  planActionStatus.classList.add("is-visible");
  window.clearTimeout(planActionStatusTimeout);
  planActionStatusTimeout = window.setTimeout(() => planActionStatus.classList.remove("is-visible"), 4000);
}

function closePlanActions({ restoreFocus = true } = {}) {
  planActionsMenu.classList.remove("is-open");
  planActionsBackdrop.classList.remove("is-open");
  planActionsMenu.hidden = true;
  planActionsBackdrop.hidden = true;
  planActionsButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) planActionsButton.focus();
}

function openPlanActions() {
  planActionsMenu.hidden = false;
  planActionsBackdrop.hidden = false;
  planActionsMenu.classList.add("is-open");
  planActionsBackdrop.classList.add("is-open");
  planActionsButton.setAttribute("aria-expanded", "true");
  planActionsMenu.querySelector('[role="menuitem"]:not(.plan-action-cancel)').focus();
}

async function copyPlanLink() {
  const action = planActionsMenu.querySelector('[data-plan-action="copy-link"]');
  action.disabled = true;
  action.querySelector("span").textContent = "Copying link…";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(window.location.href);
    closePlanActions();
    showPlanActionStatus("Plan link copied");
  } catch (error) {
    console.warn("Unable to copy plan link", error);
    closePlanActions();
    showPlanActionStatus("Unable to copy the plan link", "error");
  } finally {
    action.disabled = false;
    action.querySelector("span").textContent = "Copy plan link";
  }
}

function downloadHevyCsv() {
  const action = planActionsMenu.querySelector('[data-plan-action="download-hevy"]');
  action.disabled = true;
  action.querySelector("span").textContent = "Preparing Hevy CSV…";
  window.setTimeout(() => {
    try {
      const csv = buildHevyExport(currentRoutines);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `2-5-15-30-hevy-${date}-${activeSeed.slice(0, 6)}.csv`;
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
      closePlanActions();
      showPlanActionStatus("Hevy CSV downloaded · names may need matching in Hevy");
    } catch (error) {
      console.error("Unable to create Hevy CSV", error);
      closePlanActions();
      showPlanActionStatus("Unable to create the Hevy CSV", "error");
    } finally {
      action.disabled = false;
      action.querySelector("span").textContent = "Download Hevy CSV";
    }
  }, 0);
}

function updateEquipmentState(button) {
  const equipment = button.dataset.equipment;
  if (selectedEquipment.has(equipment)) {
    if (selectedEquipment.size === 1) return false;
    if (primaryLiftingEquipment.has(equipment)
      && ![...selectedEquipment].some((item) => item !== equipment && primaryLiftingEquipment.has(item))) return false;
    selectedEquipment.delete(equipment);
    const removeDependents = (parent) => {
      equipmentCatalog
        .filter((item) => item.dependencies.includes(parent) && selectedEquipment.has(item.key))
        .forEach((item) => {
          selectedEquipment.delete(item.key);
          removeDependents(item.key);
        });
    };
    removeDependents(equipment);
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
  const previousEquipment = new Set(selectedEquipment);
  if (updateEquipmentState(button)) {
    updatePlanUrl();
    if (!regenerateFromConfig()) {
      selectedEquipment = previousEquipment;
      syncEquipmentButtons();
      updatePlanUrl();
      regenerateFromConfig();
      showPlanToast("That equipment setup cannot build a complete routine sequence.");
    }
  }
}));
regenerateButton.addEventListener("click", () => generatePlan({ newSeed: true }));
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
hevyClose.addEventListener("click", () => hevyModal.close());
hevyModal.addEventListener("click", (event) => {
  if (event.target === hevyModal) hevyModal.close();
});
exerciseDetailClose.addEventListener("click", () => exerciseDetailModal.close());
exerciseDetailModal.addEventListener("close", () => {
  if (previousDetailTarget instanceof HTMLElement && document.contains(previousDetailTarget)) previousDetailTarget.focus();
  previousDetailTarget = null;
});
exerciseDetailModal.addEventListener("click", (event) => {
  if (event.target === exerciseDetailModal) exerciseDetailModal.close();
});
exerciseDetailExclude.addEventListener("change", () => {
  setExerciseExclusion(activeDetailExerciseId, exerciseDetailExclude.checked);
});
output.addEventListener("click", (event) => {
  const row = event.target.closest(".exercise-row-interactive");
  if (row) openExerciseDetails(row.dataset.exerciseInstance, row.dataset.exerciseId);
});
output.addEventListener("keydown", (event) => {
  const row = event.target.closest(".exercise-row-interactive");
  if (!row || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  openExerciseDetails(row.dataset.exerciseInstance, row.dataset.exerciseId);
});
excludedExerciseList.addEventListener("click", (event) => {
  const includeButton = event.target.closest("[data-include-exercise]");
  if (includeButton) setExerciseExclusion(includeButton.dataset.includeExercise, false);
});
clearExclusionsButton.addEventListener("click", () => {
  if (!excludedExerciseIds.size) return;
  excludedExerciseIds.clear();
  updatePlanUrl();
  generatePlan();
  showPlanToast("All exercise exclusions cleared");
});
planToastUndo.addEventListener("click", () => {
  const id = planToastUndo.dataset.undoExercise;
  setExerciseExclusion(id, false);
  planToast.classList.remove("is-visible");
});

planActionsButton.addEventListener("click", () => {
  if (planActionsMenu.hidden) openPlanActions();
  else closePlanActions();
});
planActionsBackdrop.addEventListener("click", () => closePlanActions());
planActionsMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-plan-action]")?.dataset.planAction;
  if (action === "copy-link") copyPlanLink();
  if (action === "send-hevy") {
    closePlanActions({ restoreFocus: false });
    openHevyModal();
  }
  if (action === "cancel") closePlanActions();
});
planActionsMenu.addEventListener("keydown", (event) => {
  const items = [...planActionsMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')]
    .filter((item) => getComputedStyle(item).display !== "none");
  const currentIndex = items.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closePlanActions();
    return;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (currentIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  }
});
document.addEventListener("focusin", (event) => {
  if (!planActionsMenu.hidden && event.target !== planActionsButton && !planActionsMenu.contains(event.target)) closePlanActions({ restoreFocus: false });
});
let previousMenuTarget = null;

function menuFocusableElements() {
  return [...mobileMenu.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

function closeMobileMenu({ restoreFocus = true } = {}) {
  mobileMenu.classList.remove("is-open");
  menuBackdrop.classList.remove("is-visible");
  document.body.classList.remove("menu-is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open menu");
  if (restoreFocus) (previousMenuTarget || menuButton).focus();
  previousMenuTarget = null;
}
menuButton.addEventListener("click", () => {
  if (mobileMenu.classList.contains("is-open")) {
    closeMobileMenu();
    return;
  }
  previousMenuTarget = document.activeElement;
  mobileMenu.classList.add("is-open");
  menuBackdrop.classList.add("is-visible");
  document.body.classList.add("menu-is-open");
  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", "Close menu");
  requestAnimationFrame(() => menuClose.focus());
});
menuClose.addEventListener("click", closeMobileMenu);
menuBackdrop.addEventListener("click", closeMobileMenu);
document.addEventListener("keydown", (event) => {
  if (mobileMenu.classList.contains("is-open") && event.key === "Tab") {
    const focusable = menuFocusableElements();
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Escape") {
    closeMobileMenu();
    if (!planActionsMenu.hidden) closePlanActions();
  }
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
  regenerateFromConfig();
});
dynamicWarmupToggle.addEventListener("change", () => {
  dynamicWarmups = dynamicWarmupToggle.checked;
  updatePlanUrl();
  regenerateFromConfig();
});
dynamicRestToggle.addEventListener("change", () => {
  dynamicRest = dynamicRestToggle.checked;
  updatePlanUrl();
  regenerateFromConfig();
});

function generateInitialPlan() {
  const requestedExclusions = [...excludedExerciseIds].sort();
  const compatibleCardio = cardioExercises.filter((exercise) =>
    exercise.equipment.some((item) => selectedEquipment.has(item)),
  );
  let restoredCardioExclusion = false;
  if (cardioEnabled() && compatibleCardio.length && !compatibleCardio.some((exercise) => !isExcluded(exercise))) {
    const cardioExclusion = [...requestedExclusions].reverse().find((id) => compatibleCardio.some((exercise) => exercise.id === id));
    if (cardioExclusion) {
      excludedExerciseIds.delete(cardioExclusion);
      restoredCardioExclusion = true;
    }
  }
  let generated = generatePlan();
  let restoredExclusions = restoredCardioExclusion;
  while (!generated && requestedExclusions.length) {
    let restoredOne = false;
    for (const exclusion of requestedExclusions) {
      excludedExerciseIds.delete(exclusion);
      if (generatePlan()) {
        requestedExclusions.splice(requestedExclusions.indexOf(exclusion), 1);
        restoredExclusions = true;
        restoredOne = true;
        break;
      }
      excludedExerciseIds.add(exclusion);
    }
    if (!restoredOne) break;
  }
  updatePlanUrl();
  if (restoredExclusions || requestedExclusions.length < [...decodeExcludedExercises(planParams.get("exclude"))].length) {
    showPlanToast("Some exclusions were restored so the plan could be completed.");
  }
}

syncEquipmentButtons();
updateSessionControls();
generateInitialPlan();
}

startApp().catch((error) => {
  console.error(error);
  document.querySelector("#routine-output").textContent = "Unable to load the workout catalog. Please refresh the page.";
});
