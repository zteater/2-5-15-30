export function createUiController({ elements, state, equipmentCatalog, primaryLiftingEquipment, equipmentDependencies, actions }) {
  const {
    equipmentButtons, countLabel, sessionSlider, dynamicWarmupToggle, dynamicRestToggle,
    infoButton, infoModal, infoClose, progressionButton, progressionModal, progressionClose,
    brandLinks, configButton, configModal, configClose, exerciseDetailModal, exerciseDetailClose,
    exerciseDetailExclude, excludedExerciseList, excludedExerciseCount, clearExclusionsButton,
    output, planToast, planToastUndo, planActionsButton, planActionsMenu, planActionsBackdrop,
    sendHevyAction, regenerateButton, menuButton, mobileMenu, menuClose, menuBackdrop, legalModal,
  } = elements;

  function updateSessionControls() {
    sessionSlider.value = String(state.sessionCount);
    sessionSlider.style.setProperty("--slider-progress", `${(state.sessionCount / 16) * 100}%`);
  }

  function syncEquipmentButtons() {
    equipmentButtons.forEach((item) => {
      const isSelected = state.selectedEquipment.has(item.dataset.equipment);
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
    if (countLabel) countLabel.textContent = `${state.selectedEquipment.size} selected`;
  }

  function updateEquipmentState(button) {
    const equipment = button.dataset.equipment;
    if (state.selectedEquipment.has(equipment)) {
      if (state.selectedEquipment.size === 1) return false;
      if (primaryLiftingEquipment.has(equipment)
        && ![...state.selectedEquipment].some((item) => item !== equipment && primaryLiftingEquipment.has(item))) return false;
      state.selectedEquipment.delete(equipment);
      const removeDependents = (parent) => {
        equipmentCatalog
          .filter((item) => item.dependencies.includes(parent) && state.selectedEquipment.has(item.key))
          .forEach((item) => {
            state.selectedEquipment.delete(item.key);
            removeDependents(item.key);
          });
      };
      removeDependents(equipment);
    } else {
      const addWithDependencies = (item) => {
        state.selectedEquipment.add(item);
        equipmentDependencies.get(item)?.forEach(addWithDependencies);
      };
      addWithDependencies(equipment);
    }
    syncEquipmentButtons();
    return true;
  }

  function menuFocusableElements() {
    return [...mobileMenu.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
  }

  let previousMenuTarget = null;
  function closeMobileMenu({ restoreFocus = true } = {}) {
    mobileMenu.classList.remove("is-open");
    menuBackdrop.classList.remove("is-visible");
    document.body.classList.remove("menu-is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
    if (restoreFocus) (previousMenuTarget || menuButton).focus();
    previousMenuTarget = null;
  }

  equipmentButtons.forEach((button) => button.addEventListener("click", () => {
    const previousEquipment = new Set(state.selectedEquipment);
    if (updateEquipmentState(button)) {
      actions.updatePlanUrl();
      if (!actions.regenerateFromConfig()) {
        state.selectedEquipment = previousEquipment;
        syncEquipmentButtons();
        actions.updatePlanUrl();
        actions.regenerateFromConfig();
        actions.showPlanToast("That equipment setup cannot build a complete routine sequence.");
      }
    }
  }));
  regenerateButton.addEventListener("click", () => actions.generatePlan({ newSeed: true }));
  infoButton.addEventListener("click", () => infoModal.showModal());
  infoClose.addEventListener("click", () => infoModal.close());
  infoModal.addEventListener("click", (event) => { if (event.target === infoModal) infoModal.close(); });
  progressionButton.addEventListener("click", () => progressionModal.showModal());
  progressionClose.addEventListener("click", () => progressionModal.close());
  progressionModal.addEventListener("click", (event) => { if (event.target === progressionModal) progressionModal.close(); });
  configButton.addEventListener("click", () => configModal.showModal());
  configClose.addEventListener("click", () => configModal.close());
  configModal.addEventListener("click", (event) => { if (event.target === configModal) configModal.close(); });
  exerciseDetailClose.addEventListener("click", () => exerciseDetailModal.close());
  exerciseDetailModal.addEventListener("close", () => {
    const target = actions.getPreviousDetailTarget();
    if (target instanceof HTMLElement && document.contains(target)) target.focus();
    actions.setPreviousDetailTarget(null);
  });
  exerciseDetailModal.addEventListener("click", (event) => { if (event.target === exerciseDetailModal) exerciseDetailModal.close(); });
  exerciseDetailExclude.addEventListener("change", () => actions.setExerciseExclusion(actions.getActiveDetailExerciseId(), exerciseDetailExclude.checked));
  output.addEventListener("click", (event) => {
    const row = event.target.closest(".exercise-row-interactive");
    if (row) actions.openExerciseDetails(row.dataset.exerciseInstance, row.dataset.exerciseId);
  });
  output.addEventListener("keydown", (event) => {
    const row = event.target.closest(".exercise-row-interactive");
    if (!row || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    actions.openExerciseDetails(row.dataset.exerciseInstance, row.dataset.exerciseId);
  });
  excludedExerciseList.addEventListener("click", (event) => {
    const includeButton = event.target.closest("[data-include-exercise]");
    if (includeButton) actions.setExerciseExclusion(includeButton.dataset.includeExercise, false);
  });
  clearExclusionsButton.addEventListener("click", () => {
    if (!state.excludedExerciseIds.size) return;
    state.excludedExerciseIds.clear();
    actions.updatePlanUrl();
    actions.generatePlan();
    actions.showPlanToast("All exercise exclusions cleared");
  });
  planToastUndo.addEventListener("click", () => {
    actions.setExerciseExclusion(planToastUndo.dataset.undoExercise, false);
    planToast.classList.remove("is-visible");
  });

  planActionsButton.addEventListener("click", () => {
    if (planActionsMenu.hidden) actions.openPlanActions();
    else actions.closePlanActions();
  });
  planActionsBackdrop.addEventListener("click", () => actions.closePlanActions());
  planActionsMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-plan-action]")?.dataset.planAction;
    if (action === "copy-link") actions.copyPlanLink();
    if (action === "send-hevy") {
      actions.closePlanActions({ restoreFocus: false });
      actions.openHevyModal();
    }
    if (action === "cancel") actions.closePlanActions();
  });
  planActionsMenu.addEventListener("keydown", (event) => {
    const items = [...planActionsMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')]
      .filter((item) => getComputedStyle(item).display !== "none");
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      actions.closePlanActions();
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
    if (!planActionsMenu.hidden && event.target !== planActionsButton && !planActionsMenu.contains(event.target)) actions.closePlanActions({ restoreFocus: false });
  });

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
      if (!planActionsMenu.hidden) actions.closePlanActions();
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
    actions.generatePlan({ newSeed: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }));
  sessionSlider.addEventListener("input", () => {
    state.sessionCount = actions.parseSessionCount(sessionSlider.value);
    updateSessionControls();
    actions.updatePlanUrl();
    actions.regenerateFromConfig();
  });
  dynamicWarmupToggle.addEventListener("change", () => {
    state.dynamicWarmups = dynamicWarmupToggle.checked;
    actions.updatePlanUrl();
    actions.regenerateFromConfig();
  });
  dynamicRestToggle.addEventListener("change", () => {
    state.dynamicRest = dynamicRestToggle.checked;
    actions.updatePlanUrl();
    actions.regenerateFromConfig();
  });

  syncEquipmentButtons();
  updateSessionControls();
  return { syncEquipmentButtons, updateSessionControls };
}
