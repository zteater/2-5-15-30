const SESSION_OPTIONS = [4, 8, 12, 16];

function decodeBase36BigInt(value) {
  let result = 0n;
  for (const character of value.toLowerCase()) {
    const digit = "0123456789abcdefghijklmnopqrstuvwxyz".indexOf(character);
    if (digit < 0) return null;
    result = result * 36n + BigInt(digit);
  }
  return result;
}

export function createPlanState({ windowRef = window, documentRef = document, themeToggles = [], equipmentCatalog, cardioEquipment, exerciseIds }) {
  const planParams = new URLSearchParams(windowRef.location.search);
  const equipmentDependencies = new Map(equipmentCatalog.map((item) => [item.key, item.dependencies || []]));
  const defaultEquipment = equipmentCatalog.filter((item) => item.isDefault).map((item) => item.key);
  const equipmentKeys = equipmentCatalog.map((item) => item.key);

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
    return SESSION_OPTIONS.includes(parsed) ? parsed : 4;
  }

  function decodeExcludedExercises(value) {
    if (!value) return [];
    return value.split(",").map((id) => id.trim()).filter((id) => exerciseIds.has(id));
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

  function createSeed() {
    if (windowRef.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      windowRef.crypto.getRandomValues(values);
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

  const decodedPlan = decodePlanSeed(planParams.get("seed"));
  const state = {
    excludedExerciseIds: new Set(decodeExcludedExercises(planParams.get("exclude"))),
    selectedEquipment: new Set(resolveEquipmentDependencies(decodedPlan?.equipment || defaultEquipment)),
    sessionCount: decodedPlan?.sessions || 4,
    dynamicWarmups: decodedPlan?.dynamicWarmups ?? true,
    dynamicRest: decodedPlan?.dynamicRest ?? true,
    activeSeed: decodedPlan?.seed || createSeed(),
  };

  function cardioEnabled() {
    return [...state.selectedEquipment].some((equipment) => cardioEquipment.has(equipment));
  }

  function encodePlanSeed() {
    const equipmentMask = [...state.selectedEquipment].reduce((mask, equipment) => mask | (1n << BigInt(equipmentKeys.indexOf(equipment))), 0n);
    const themeCode = documentRef.documentElement.dataset.theme === "light" ? "l" : "d";
    return `${state.activeSeed}.${state.sessionCount}.${cardioEnabled() ? "1" : "0"}.${equipmentMask.toString(36)}.${themeCode}.${state.dynamicWarmups ? "1" : "0"}.${state.dynamicRest ? "1" : "0"}.7`;
  }

  function updatePlanUrl() {
    const url = new URL(windowRef.location.href);
    url.searchParams.set("seed", encodePlanSeed());
    const encodedExclusions = [...state.excludedExerciseIds].sort().join(",");
    if (encodedExclusions) url.searchParams.set("exclude", encodedExclusions);
    else url.searchParams.delete("exclude");
    url.searchParams.delete("sessions");
    url.searchParams.delete("equipment");
    url.searchParams.delete("cardio");
    url.hash = "";
    windowRef.history.replaceState({}, "", url);
  }

  function planSeedMaterial() {
    return `${state.activeSeed}:${state.sessionCount}:${[...state.selectedEquipment].sort().join(",")}:${[...state.excludedExerciseIds].sort().join(",")}:${cardioEnabled() ? "1" : "0"}:${state.dynamicWarmups ? "1" : "0"}:${state.dynamicRest ? "1" : "0"}`;
  }

  let randomState = hashSeed(planSeedMaterial());
  function resetRandom(attempt = 0) {
    randomState = hashSeed(attempt ? `${planSeedMaterial()}:${attempt}` : planSeedMaterial());
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

  const sunIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>';
  const moonIcon = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3 8.5 8.5 0 1 0 20.7 15.3z" /></svg>';
  function setTheme(theme) {
    const isDark = theme === "dark";
    documentRef.documentElement.dataset.theme = isDark ? "dark" : "light";
    documentRef.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#1f2428" : "#f5f4ef");
    themeToggles.forEach((toggle) => {
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.innerHTML = isDark ? sunIcon : moonIcon;
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  setTheme(decodedPlan?.theme || "dark");
  updatePlanUrl();

  return {
    state,
    planParams,
    decodedPlan,
    sessionOptions: SESSION_OPTIONS,
    equipmentDependencies,
    equipmentKeys,
    resolveEquipmentDependencies,
    decodeExcludedExercises,
    parseSessionCount,
    cardioEnabled,
    createSeed,
    updatePlanUrl,
    resetRandom,
    seededRandom,
    shuffle,
    setTheme,
  };
}
