import { createPlanner } from "./planner.js";
import { createRoutineRenderer } from "./routine-renderer.js";
import { createHevyUi } from "./hevy-ui.js";
import { createPlanState } from "./plan-state.js";
import { createUiController } from "./ui-modals.js";

async function startApp() {
  const loadJson = (file) => fetch(`./${file}?v=20260985`).then((response) => {
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
if (cardsActions && regenerateButton) cardsActions.insertBefore(regenerateButton, cardsActions.firstChild);
const equipmentLabels = new Map(equipmentCatalog.flatMap((item) => [
  [item.key, item.label],
  ...(item.aliases || []).map((alias) => [alias, item.label]),
]));
const primaryLiftingEquipment = new Set(equipmentCatalog.filter((item) => item.group === "primary").map((item) => item.key));
const cardioEquipment = new Set(equipmentCatalog.filter((item) => item.group === "cardio").map((item) => item.key));

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

const equipmentReferences = new Set(equipmentCatalog.flatMap((item) => [item.key, ...(item.aliases || [])]));
const knownSupersetConflictResources = new Set([
  "loaded-olympic-bar",
  "loaded-ez-bar",
  "loaded-trap-bar",
  "landmine",
  "rack",
  "bench-flat",
  "bench-incline",
  "band-anchor",
]);
const duplicateExerciseIds = exercises.map((exercise) => exercise.id).filter((id, index, ids) => ids.indexOf(id) !== index);
const catalogErrors = [
  duplicateExerciseIds.length ? `duplicate exercise IDs: ${[...new Set(duplicateExerciseIds)].join(", ")}` : "",
  equipmentCatalog.some((item) => !item.key || !item.group || !Array.isArray(item.dependencies)) ? "invalid equipment record" : "",
  exercises.some((exercise) => !exercise.id || !Array.isArray(exercise.equipment)) ? "invalid exercise record" : "",
  exercises.some((exercise) => [...(exercise.equipment || []), ...(exercise.requires || [])].some((item) => item !== "bodyweight" && !equipmentReferences.has(item))) ? "unknown exercise equipment reference" : "",
  exercises.some((exercise) => exercise.type === "strength" && !Array.isArray(exercise.supersetConflicts)) ? "strength exercise superset conflicts missing" : "",
  exercises.some((exercise) => (exercise.supersetConflicts || []).some((resource) => !knownSupersetConflictResources.has(resource))) ? "unknown superset conflict resource" : "",
  exercises.some((exercise) => "setup" in exercise || "setupResources" in exercise) ? "legacy setup fields remain" : "",
  exercises.some((exercise) => !exercise.instructions?.length) ? "exercise instructions missing" : "",
  !Array.isArray(coverageCycle) || coverageCycle.length !== 4 ? "coverage cycle must contain four routines" : "",
].filter(Boolean);
if (catalogErrors.length) throw new Error(`Workout catalog validation failed: ${catalogErrors.join("; ")}`);

const planState = createPlanState({
  windowRef: window,
  documentRef: document,
  themeToggles,
  equipmentCatalog,
  cardioEquipment,
  exerciseIds,
});
const {
  state: planSettings,
  planParams,
  equipmentDependencies,
  decodeExcludedExercises,
  parseSessionCount,
  cardioEnabled: getCardioEnabled,
  createSeed,
  updatePlanUrl: updatePlanUrlInternal,
  resetRandom: resetRandomInternal,
  seededRandom,
  shuffle,
  setTheme,
} = planState;
let selectedEquipment = planSettings.selectedEquipment;
let sessionCount = planSettings.sessionCount;
let dynamicWarmups = planSettings.dynamicWarmups;
let dynamicRest = planSettings.dynamicRest;
let activeSeed = planSettings.activeSeed;
const excludedExerciseIds = planSettings.excludedExerciseIds;
const isExcluded = (exercise) => excludedExerciseIds.has(exercise.id);
const syncPlanSettings = () => {
  planSettings.selectedEquipment = selectedEquipment;
  planSettings.sessionCount = sessionCount;
  planSettings.dynamicWarmups = dynamicWarmups;
  planSettings.dynamicRest = dynamicRest;
  planSettings.activeSeed = activeSeed;
};
const cardioEnabled = () => {
  syncPlanSettings();
  return getCardioEnabled();
};
const updatePlanUrl = () => {
  syncPlanSettings();
  return updatePlanUrlInternal();
};
const resetRandom = (attempt = 0) => {
  syncPlanSettings();
  return resetRandomInternal(attempt);
};
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
themeToggles.forEach((toggle) => toggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  updatePlanUrl();
}));
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

function labelMuscle(muscle) {
  return muscle;
}

const planner = createPlanner({
  exercises,
  coverageCycle,
  equipmentCatalog,
  getConfig: () => ({ selectedEquipment, excludedExerciseIds, dynamicWarmups, dynamicRest }),
  shuffle,
  seededRandom,
});
const {
  cardioExercises,
  exerciseWarmupSets,
  unsupportedCoverageMuscles,
  buildRoutine,
  buildCoverageMusclePlan,
  supersetRestPeriods,
  cardioDurationMinutes,
} = planner;

const routineRenderer = createRoutineRenderer({
  equipmentLabels,
  exerciseWarmupSets,
  supersetRestPeriods,
  labelMuscle,
});
const {
  escapeHtml,
  exerciseDisplayName,
  exerciseTypeLabel,
  renderExerciseDetails,
  renderRoutine,
} = routineRenderer;

let currentExerciseDetails = new Map();
let activeDetailExerciseId = null;
let previousDetailTarget = null;
let exclusionToastTimeout;

let lastPlanSignature = null;
let currentRoutines = [];
let currentPlanRoutines = [];

const hevyUi = createHevyUi({
  elements: {
    sendAction: sendHevyAction,
    modal: document.querySelector("#hevy-modal"),
    close: document.querySelector("#hevy-close"),
    content: document.querySelector("#hevy-modal-content"),
  },
  hevyMappings,
  escapeHtml,
  getPlan: () => ({
    routines: currentPlanRoutines,
    seed: activeSeed,
    sessions: sessionCount,
    selectedEquipment,
    excludedExerciseIds,
    dynamicWarmups,
    dynamicRest,
  }),
});
const { updateHevyActionState, openHevyModal } = hevyUi;

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

const uiState = {
  get selectedEquipment() { return selectedEquipment; },
  set selectedEquipment(value) { selectedEquipment = value; },
  get sessionCount() { return sessionCount; },
  set sessionCount(value) { sessionCount = value; },
  get dynamicWarmups() { return dynamicWarmups; },
  set dynamicWarmups(value) { dynamicWarmups = value; },
  get dynamicRest() { return dynamicRest; },
  set dynamicRest(value) { dynamicRest = value; },
  excludedExerciseIds,
};

createUiController({
  elements: {
    equipmentButtons, countLabel, sessionSlider, dynamicWarmupToggle, dynamicRestToggle,
    infoButton, infoModal, infoClose, progressionButton, progressionModal, progressionClose,
    brandLinks, configButton, configModal, configClose, exerciseDetailModal, exerciseDetailClose,
    exerciseDetailExclude, excludedExerciseList, excludedExerciseCount, clearExclusionsButton,
    output, planToast, planToastUndo, planActionsButton, planActionsMenu, planActionsBackdrop,
    sendHevyAction, regenerateButton, menuButton, mobileMenu, menuClose, menuBackdrop, legalModal,
  },
  state: uiState,
  equipmentCatalog,
  primaryLiftingEquipment,
  equipmentDependencies,
  actions: {
    updatePlanUrl,
    parseSessionCount,
    generatePlan,
    regenerateFromConfig,
    openExerciseDetails,
    setExerciseExclusion,
    showPlanToast,
    openHevyModal,
    copyPlanLink,
    openPlanActions,
    closePlanActions,
    getActiveDetailExerciseId: () => activeDetailExerciseId,
    getPreviousDetailTarget: () => previousDetailTarget,
    setPreviousDetailTarget: (target) => { previousDetailTarget = target; },
  },
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

generateInitialPlan();
}

startApp().catch((error) => {
  console.error(error);
  document.querySelector("#routine-output").textContent = "Unable to load the workout catalog. Please refresh the page.";
});
