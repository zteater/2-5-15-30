import { calculateRoutineMinutes, calculateRoutineSeconds } from "./routine-timing.js";

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
const LOADED_BAR_CONFLICTS = new Set([
  "loaded-olympic-bar",
  "loaded-ez-bar",
  "loaded-trap-bar",
  "landmine",
]);
const BENCH_CONFLICT_PREFIX = "bench-";
const COVERAGE_MUSCLES = ["shoulders", "biceps", "triceps", "back", "chest", "quads", "hamstrings", "calves"];
const PRIMARY_COVERAGE_MUSCLES = ["shoulders", "back", "chest", "quads", "hamstrings"];
const WARMUP_PROTOCOLS = {
  ramp2: ["W × 8 × 50%", "W × 4 × 75%"],
  easy1: ["W × 5 × 50%"],
  powerPrep: ["W × 5"],
  none: [],
};

export function createPlanner({ exercises, coverageCycle, equipmentCatalog, getConfig, shuffle, seededRandom }) {
  const strengthExercises = exercises.filter((exercise) => exercise.type === "strength");
  const cardioExercises = exercises.filter((exercise) => exercise.type === "cardio");
  const conditioningEquipment = new Set(equipmentCatalog.filter((item) => item.group === "conditioning").map((item) => item.key));
  const universalWarmupSets = new Map();
  exercises.filter((exercise) => exercise.type === "warmup" && exercise.isUniversal)
    .forEach((exercise) => {
      const set = universalWarmupSets.get(exercise.universalSet) || [];
      set.push(exercise);
      universalWarmupSets.set(exercise.universalSet, set);
    });

  const isExcluded = (exercise) => getConfig().excludedExerciseIds.has(exercise.id);
  const selectedEquipment = () => getConfig().selectedEquipment;
  const dynamicWarmups = () => getConfig().dynamicWarmups;
  const dynamicRest = () => getConfig().dynamicRest;

  function exerciseWarmupSets(exercise) {
    return WARMUP_PROTOCOLS[exercise.warmupProtocol] || [];
  }

  function matchesSelectedEquipment(exercise) {
    const requirements = [...(exercise.equipment || []), ...(exercise.requires || [])]
      .filter((item) => item !== "bodyweight")
      .flatMap((item) => item !== "barbell" ? [item] : ["bar"]);
    return [...new Set(requirements)].every((item) => selectedEquipment().has(item));
  }

  function supersetExercisesConflict(exercise, supersetExercises) {
    const exerciseConflicts = new Set(exercise.supersetConflicts || []);
    return supersetExercises.some((partner) => {
      const partnerConflicts = new Set(partner.supersetConflicts || []);
      const exerciseUsesLoadedBar = [...exerciseConflicts].some((resource) => LOADED_BAR_CONFLICTS.has(resource));
      const partnerUsesLoadedBar = [...partnerConflicts].some((resource) => LOADED_BAR_CONFLICTS.has(resource));
      if (exerciseUsesLoadedBar && partnerUsesLoadedBar) return true;
      const exerciseUsesBench = [...exerciseConflicts].some((resource) => resource.startsWith(BENCH_CONFLICT_PREFIX));
      const partnerUsesBench = [...partnerConflicts].some((resource) => resource.startsWith(BENCH_CONFLICT_PREFIX));
      if (exerciseUsesBench && partnerUsesBench) return true;
      return [...exerciseConflicts].some((resource) => partnerConflicts.has(resource));
    });
  }

  function isBodyweightOnly(exercise) {
    return exercise.equipment.includes("bodyweight")
      && exercise.equipment.every((item) => item === "bodyweight" || item === "bench");
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
        && !supersetExercisesConflict(exercise, supersetExercises)
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
    const preferred = preferredMuscle === "core" ? candidates.filter((exercise) => exercise.muscle === "core") : [];
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
        && !supersetExercisesConflict(exercise, supersetExercises)
        && (!exercise.unilateral
          || routineExercises.filter((routineExercise) => routineExercise.unilateral).length < MAX_UNILATERAL_EXERCISES),
    );
    return [...new Map(pools
      .flatMap((pool) => [...compatibleExercises(pool, true), ...compatibleExercises(pool, false)])
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
    if (exercise.supersetConflicts?.some((resource) => [
      "rack",
      "landmine",
      "loaded-olympic-bar",
      "loaded-ez-bar",
      "loaded-trap-bar",
    ].includes(resource))) score += 20;
    if (/pull-up|chin-up/.test(name)) score += 15;
    if (exercise.equipment.includes("dumbbells")) score += 10;
    return score;
  }

  function chooseSecondaryWarmup(exercisesInRoutine) {
    const preparedPatterns = exercisesInRoutine.slice(0, 2).map((exercise) => exercise.movementPattern);
    const candidates = exercisesInRoutine.slice(2)
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
    const exercisesInRoutine = baseExercises.map((exercise) => exercise.id === secondaryWarmup?.id
      ? {
        ...exercise,
        secondaryWarmupSets: [
          /pull-up|chin-up/i.test(exercise.name) ? SECONDARY_PULL_WARMUP_DOSE : SECONDARY_WARMUP_DOSE,
        ],
      }
      : exercise);
    const warmupTargets = shuffle(exercisesInRoutine.slice(0, 4)).slice(0, Math.min(3, exercisesInRoutine.length));
    const matchedWarmups = dynamicWarmups() ? chooseWarmups(warmupTargets) : [];
    const warmups = dynamicWarmups()
      ? matchedWarmups.flatMap((warmup, index) => warmup ? [{ ...warmup, muscle: warmupTargets[index].muscle }] : [])
      : universalWarmupsForRoutine(sequenceNumber).map((warmup) => ({ ...warmup, muscle: "full body" }));
    if (exercisesInRoutine.length > 4) {
      const warmedExerciseIds = new Set(warmupTargets.map((exercise) => exercise.id));
      const optionalExercise = shuffle(exercisesInRoutine.filter((exercise) => !warmedExerciseIds.has(exercise.id)))[0]
        || shuffle(exercisesInRoutine)[0];
      const optionalWarmup = chooseWarmups([optionalExercise], warmups.map((warmup) => warmup.id))[0];
      if (optionalWarmup) warmups.push({ ...optionalWarmup, muscle: optionalExercise.muscle, optional: true });
    }
    const restPeriods = supersetRestPeriods(exercisesInRoutine);
    const timing = {
      exercises: exercisesInRoutine,
      warmups,
      restPeriods,
      transitionSeconds: ROUTINE_TRANSITION_SECONDS,
      preparationRecoverySeconds: SECONDARY_WARMUP_RECOVERY_SECONDS,
    };
    const liftingSeconds = calculateRoutineSeconds(timing);
    const liftingMinutes = calculateRoutineMinutes(timing);
    return {
      sequenceNumber,
      exercises: exercisesInRoutine,
      warmups,
      totalSets: exercisesInRoutine.reduce((total, exercise) => total + exercise.sets, 0),
      restPeriods,
      liftingSeconds,
      liftingMinutes,
      cardioMinutes: 0,
      minutes: liftingMinutes,
    };
  }

  function candidatePreference(first, second) {
    const firstTarget = first.liftingSeconds <= TARGET_LIFTING_SECONDS;
    const secondTarget = second.liftingSeconds <= TARGET_LIFTING_SECONDS;
    if (firstTarget !== secondTarget) return firstTarget ? -1 : 1;
    return first.liftingSeconds - second.liftingSeconds;
  }

  function buildRoutine(sequenceNumber, recentExerciseIds = [], targetExerciseCount = 4, targetMuscles = []) {
    const liftingMuscles = targetMuscles.slice(0, 4);
    const baseCombinations = [];
    const collectBaseCombinations = (index, built) => {
      if (baseCombinations.length >= MAX_ROUTINE_CANDIDATES) return;
      if (index === liftingMuscles.length) {
        baseCombinations.push(built);
        return;
      }
      const supersetStart = index < 2 ? 0 : 2;
      const candidates = exerciseCandidates(liftingMuscles[index], built.slice(supersetStart), index, recentExerciseIds, built);
      candidates.forEach((exercise) => {
        if (baseCombinations.length >= MAX_ROUTINE_CANDIDATES) return;
        collectBaseCombinations(index + 1, [...built, { ...exercise, muscle: liftingMuscles[index] }]);
      });
    };
    collectBaseCombinations(0, []);
    if (!baseCombinations.length) return null;
    const baseCandidates = baseCombinations
      .map((candidate) => finalizeRoutineCandidate(sequenceNumber, candidate))
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
    const available = matchingEquipment.length ? matchingEquipment : candidates.filter((warmup) => warmup.equipment.includes("bodyweight"));
    return shuffle(available.length ? available : candidates);
  }

  function chooseWarmups(exercisesToWarm, existingWarmupIds = []) {
    const options = exercisesToWarm.map((exercise, index) => ({
      index,
      candidates: warmupCandidates(exercise.muscle),
    })).sort((first, second) => first.candidates.length - second.candidates.length);
    const selected = Array(exercisesToWarm.length);
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
    assignWarmup(0);
    return selected;
  }

  function exerciseRestPeriod(exercise) {
    const exercisePeriod = exercise.restPeriod ?? FIXED_REST_PERIODS[1];
    return exercise.primary ? Math.max(exercisePeriod, PRIMARY_REST_PERIOD) : exercisePeriod;
  }

  function supersetRestPeriods(exercisesInRoutine) {
    const groups = exercisesInRoutine.length === 5
      ? [exercisesInRoutine.slice(0, 2), exercisesInRoutine.slice(2)]
      : [exercisesInRoutine.slice(0, 2), exercisesInRoutine.slice(2, 4)];
    return groups.map((group, groupIndex) => {
      if (!dynamicRest()) return FIXED_REST_PERIODS[groupIndex];
      return group.length ? Math.max(...group.map(exerciseRestPeriod)) : FIXED_REST_PERIODS[1];
    });
  }

  function cardioDurationMinutes(cardio) {
    return cardio?.timing.reduce((total, interval) => {
      const duration = Number.parseFloat(interval.duration);
      const repetitions = /^\d+$/.test(String(interval.sets)) ? Number(interval.sets) : 1;
      return total + repetitions * (interval.duration.includes("sec") ? duration / 60 : duration);
    }, 0) || 0;
  }

  return {
    cardioExercises,
    strengthExercises,
    exerciseWarmupSets,
    matchesSelectedEquipment,
    supersetExercisesConflict,
    unsupportedCoverageMuscles,
    buildRoutine,
    buildCoverageMusclePlan,
    supersetRestPeriods,
    cardioDurationMinutes,
  };
}
