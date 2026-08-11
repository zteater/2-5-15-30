import { HevyApiError, HevyClient, listAllPages } from "./hevy-client.js";
import { buildExportId, buildHevyFolderRequest, buildHevyRoutineRequests, validateHevyExport } from "./hevy-export.js";

export function createHevyUi({ elements, hevyMappings, escapeHtml, getPlan }) {
  let hevyClient = null;
  let hevyExportState = null;

  function hevyErrorMessage(error) {
    if (error?.code === "auth") return "That Hevy API key was not accepted.";
    if (error?.code === "network") return navigator.onLine === false
      ? "Unable to reach Hevy. Check your connection and try again."
      : "Hevy blocked this browser request. Direct integration is not currently available.";
    if (error?.code === "timeout") return "Unable to reach Hevy. Check your connection and try again.";
    if (error?.code === "rate-limit") return "Hevy is rate limiting requests. Try again in a moment.";
    return "Hevy could not complete this request. Try again.";
  }

  function updateHevyActionState() {
    if (elements.sendAction) elements.sendAction.disabled = getPlan().routines.length === 0;
  }

  function hevyPlanSnapshot() {
    const routines = getPlan().routines;
    return typeof structuredClone === "function" ? structuredClone(routines) : JSON.parse(JSON.stringify(routines));
  }

  function hevyPlanSummary() {
    const routines = getPlan().routines;
    return {
      routines: routines.length,
      exercises: routines.reduce((total, routine) => total + routine.exercises.length, 0),
      cardio: routines.filter((routine) => routine.cardio).length,
    };
  }

  function hevyFolderTitle() {
    return `2–5–15–30 · Plan ${getPlan().seed.slice(0, 6)}`;
  }

  function renderHevyConnection() {
    elements.content.innerHTML = `<form class="hevy-form" id="hevy-connect-form">
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
    document.querySelector("#hevy-cancel").addEventListener("click", () => elements.modal.close());
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
    const validation = validateHevyExport(getPlan().routines, hevyMappings);
    const missingMarkup = validation.valid ? "" : `<div class="hevy-error" role="alert"><strong>Mapping required before export</strong><p>This plan contains exercises that are not yet mapped to Hevy:</p><ul>${validation.missing.map((exercise) => `<li>${escapeHtml(exercise.name)}</li>`).join("")}</ul></div>`;
    elements.content.innerHTML = `<div class="hevy-confirmation">
      <p class="info-modal-lede">Send ${summary.routines} routines to Hevy?</p>
      <label class="hevy-field" for="hevy-folder-title"><strong>Folder</strong><input id="hevy-folder-title" type="text" value="${escapeHtml(hevyFolderTitle())}" maxlength="80" /></label>
      <div class="hevy-summary"><strong>${summary.routines} routines</strong><strong>${summary.exercises} exercises</strong><strong>${summary.cardio} cardio finishers</strong></div>
      ${missingMarkup}
      ${message ? `<p class="hevy-status" role="status">${escapeHtml(message)}</p>` : ""}
      <div class="hevy-dialog-actions"><button class="text-button" id="hevy-disconnect" type="button">Disconnect</button><button class="text-button" id="hevy-cancel" type="button">Cancel</button><button class="primary-button" id="hevy-send" type="button"${validation.valid ? "" : " disabled"}>Send routines</button></div>
    </div>`;
    document.querySelector("#hevy-cancel").addEventListener("click", () => elements.modal.close());
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
    elements.content.innerHTML = `<div class="hevy-progress"><p class="info-modal-lede" role="status">${escapeHtml(message)}</p><div class="hevy-progress-bar"><span style="width:${hevyExportState ? `${(hevyExportState.createdRoutines.size / hevyExportState.total) * 100}%` : "0%"}"></span></div></div>`;
  }

  function renderHevyResult(message, { partial = false } = {}) {
    const created = hevyExportState?.createdRoutines.size || 0;
    const total = hevyExportState?.total || getPlan().routines.length;
    elements.content.innerHTML = `<div class="hevy-result"><p class="info-modal-lede">${escapeHtml(message)}</p>${partial ? `<p class="hevy-error" role="alert">${created} of ${total} routines were created. Retry only the remaining routines.</p>` : ""}<div class="hevy-dialog-actions"><button class="text-button" id="hevy-disconnect" type="button">Disconnect</button>${partial ? `<button class="primary-button" id="hevy-retry" type="button">Retry remaining routines</button>` : `<button class="primary-button" id="hevy-done" type="button">Done</button>`}</div></div>`;
    document.querySelector("#hevy-disconnect").addEventListener("click", disconnectHevy);
    document.querySelector("#hevy-retry")?.addEventListener("click", () => sendHevyRoutines(hevyExportState.folderTitle, true));
    document.querySelector("#hevy-done")?.addEventListener("click", () => elements.modal.close());
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
    const plan = getPlan();
    if (!hevyClient || !plan.routines.length) return;
    const snapshot = hevyPlanSnapshot();
    const exportId = buildExportId({
      seed: plan.seed,
      sessions: plan.sessions,
      selectedEquipment: plan.selectedEquipment,
      excludedExerciseIds: plan.excludedExerciseIds,
      dynamicWarmups: plan.dynamicWarmups,
      dynamicRest: plan.dynamicRest,
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
      const payloads = draftPayloads.map((payload) => ({ ...payload, routine: { ...payload.routine, folder_id: folder.id } }));
      const findExistingRoutine = async (routineNumber) => {
        const routines = await listAllPages((page) => hevyClient.listRoutines(page, 10), "routines");
        return routines.find((routine) => String(routine.folder_id) === String(folder.id)
          && String(routine.notes || "").includes(`Plan ID: ${exportId}`)
          && Number(String(routine.notes).match(/Routine:\s*(\d+)/)?.[1]) === routineNumber);
      };
      const waitBeforeRetry = async (error, attempt) => {
        const retryAfterSeconds = Number(error.retryAfter);
        const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0 ? Math.min(retryAfterSeconds * 1000, 30000) : Math.min(500 * (2 ** attempt), 30000);
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
    if (!getPlan().routines.length) return;
    if (!hevyClient) renderHevyConnection();
    else renderHevyConfirmation();
    elements.modal.showModal();
  }

  elements.close.addEventListener("click", () => elements.modal.close());
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) elements.modal.close();
  });

  return { updateHevyActionState, openHevyModal };
}
