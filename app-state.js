/**
 * LogoAdder Pro - Tactical Build
 * Logic: PERSISTENCE | BATCH PROCESSING | DRAG & DROP | HUD NAV
 */

// ==========================================
// SECTOR 1: CONSTANTS & STATE
// ==========================================
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const bgInput = document.getElementById('bgInput');
const logoInput = document.getElementById('logoInput');
const resultsGallery = document.getElementById('resultsGallery');
const resultsSection = document.getElementById('results-section');
const zipContainer = document.getElementById('zipDownloadContainer');
const posButtons = document.querySelectorAll('.pos-btn');
const hiddenPosInput = document.getElementById('position');
const dropOverlay = document.getElementById('drop-overlay');
const ui = {
    appStatusMessage: document.getElementById('appStatusMessage'),
    adjustPanel: document.getElementById('adjustPanel'),
    adjustTabBtn: document.getElementById('adjustTabBtn'),
    applyCropBtn: document.getElementById('applyCropBtn'),
    autoAllBtn: document.getElementById('autoAllBtn'),
    autoCurrentBtn: document.getElementById('autoCurrentBtn'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    brightnessValue: document.getElementById('brightnessValue'),
    cancelExportBtn: document.getElementById('cancelExportBtn'),
    canvasPlaceholder: document.getElementById('canvas-placeholder'),
    changeSaveFolderBtn: document.getElementById('changeSaveFolderBtn'),
    contrastSlider: document.getElementById('contrastSlider'),
    contrastValue: document.getElementById('contrastValue'),
    cropBox: document.getElementById('cropBox'),
    cropOverlay: document.getElementById('cropOverlay'),
    cropStatus: document.getElementById('cropStatus'),
    dismissGuidanceBtn: document.getElementById('dismissGuidanceBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    exportProgressContainer: document.querySelector('.export-progress-container'),
    exportSummaryCard: document.getElementById('exportSummaryCard'),
    exportSummaryCurrentFile: document.getElementById('exportSummaryCurrentFile'),
    exportSummaryDestination: document.getElementById('exportSummaryDestination'),
    exportSummaryNote: document.getElementById('exportSummaryNote'),
    exportSummarySaved: document.getElementById('exportSummarySaved'),
    exportSummarySkipped: document.getElementById('exportSummarySkipped'),
    exportSummaryStatus: document.getElementById('exportSummaryStatus'),
    exportSummaryTitle: document.getElementById('exportSummaryTitle'),
    fileCount: document.getElementById('fileCount'),
    finalZipBtn: document.getElementById('finalZipBtn'),
    fineRotateSlider: document.getElementById('fineRotateSlider'),
    flipHorizontalBtn: document.getElementById('flipHorizontalBtn'),
    flipVerticalBtn: document.getElementById('flipVerticalBtn'),
    highlightsSlider: document.getElementById('highlightsSlider'),
    highlightsValue: document.getElementById('highlightsValue'),
    logoOpacity: document.getElementById('logo-opacity'),
    logoStatus: document.getElementById('logoStatus'),
    marginX: document.getElementById('marginX'),
    marginY: document.getElementById('marginY'),
    navControls: document.getElementById('nav-controls'),
    navStatus: document.getElementById('navStatus'),
    opacityVal: document.getElementById('opacity-val'),
    progressCount: document.getElementById('progress-count'),
    progressFill: document.getElementById('export-progress-fill'),
    progressText: document.getElementById('progress-text'),
    qualityPreset: document.getElementById('qualityPreset'),
    resetAdjustBtn: document.getElementById('resetAdjustBtn'),
    resetCropBtn: document.getElementById('resetCropBtn'),
    resetRotateBtn: document.getElementById('resetRotateBtn'),
    rotateCropPanel: document.getElementById('rotateCropPanel'),
    rotateCropTabBtn: document.getElementById('rotateCropTabBtn'),
    rotateLeftBtn: document.getElementById('rotateLeftBtn'),
    rotateRightBtn: document.getElementById('rotateRightBtn'),
    rotationValue: document.getElementById('rotationValue'),
    saturationSlider: document.getElementById('saturationSlider'),
    saturationValue: document.getElementById('saturationValue'),
    shadowsSlider: document.getElementById('shadowsSlider'),
    shadowsValue: document.getElementById('shadowsValue'),
    sizeSlider: document.getElementById('sizeSlider'),
    sizePreset: document.getElementById('sizePreset'),
    sizeVal: document.getElementById('sizeVal'),
    startCropBtn: document.getElementById('startCropBtn'),
    temperatureSlider: document.getElementById('temperatureSlider'),
    temperatureValue: document.getElementById('temperatureValue'),
    placeholderText: document.querySelector('.placeholder-text'),
    firstRunGuidance: document.getElementById('firstRunGuidance'),
    firstRunGuidanceBody: document.getElementById('firstRunGuidanceBody')
};

let bgFiles = [];
let currentIdx = 0;
let logoImg = null;
let currentPreviewImg = null;
let currentZipDownloads = [];
let resultPreviewUrls = [];
let mobileShareState = null;
let renderedPreviewCount = 0;
let androidSaveDirectoryHandle = null;
let exportCancelRequested = false;
let isProcessing = false;
let pendingAppReload = false;
let hasReloadedForUpdate = false;
let exportSummaryState = null;
let exportFailureItems = [];
let activePhotoEditTab = "adjust";
let cropModeActive = false;
let cropPointerState = null;
let heicBatchWorkers = [];
let heicBatchWorkerIndex = 0;
let heicBatchWorkerRequestId = 0;
const heicConversionCache = new WeakMap();
const autoAdjustmentCache = new WeakMap();
const photoEditStates = [];
const pendingHeicBatchWorkerRequests = new Map();

const DEFAULT_PLACEHOLDER_TEXT = ui.placeholderText ? ui.placeholderText.innerText : "សូមជ្រើសរើសរូបភាពដើម្បីចាប់ផ្ដើម";

const MAX_OUTPUT_PIXELS = 4000000;
const ZIP_CHUNK_SIZE = 5;
const MOBILE_SHARE_BATCH_SIZE = 10;
const RESULT_PREVIEW_PAGE_SIZE = 20;
const AUTO_DOWNLOAD_THRESHOLD = 20;
const ANDROID_FILE_TIMEOUT_MS = 20000;
const ANDROID_HEIC_COOLDOWN_MS = 60;
const DESKTOP_HEIC_PRECONVERT_AHEAD = 2;
const CROP_MIN_SIZE = 0.06;
const DIRECTORY_DB_NAME = "logoAdderDirectoryAccess";
const DIRECTORY_STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "androidSaveDirectory";
const CONFIG_STORAGE_KEY = "logoAdderConfig_v1";
const PERSISTENT_LOGO_KEY = "logoAdder_PersistentLogo";
const GUIDANCE_VERSION_KEY = "logoAdderGuidanceSeen_v1";
const QUALITY_PRESET_MAP = {
    high: 0.95,
    balanced: 0.85,
    small: 0.75
};
const SIZE_PRESET_MAP = {
    original: MAX_OUTPUT_PIXELS,
    large: 3000000,
    medium: 2000000,
    small: 1200000
};
const ADJUSTMENT_KEYS = ["brightness", "contrast", "highlights", "shadows", "saturation", "temperature"];
const DEFAULT_ADJUSTMENTS = {
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    temperature: 0
};
let fallbackPhotoAdjustments = { ...DEFAULT_ADJUSTMENTS };

function reloadForPendingUpdate() {
    if (hasReloadedForUpdate) {
        return;
    }

    hasReloadedForUpdate = true;
    window.location.reload();
}

function clearAppStatus() {
    if (!ui.appStatusMessage) {
        return;
    }

    ui.appStatusMessage.innerText = "";
    ui.appStatusMessage.style.display = "none";
    ui.appStatusMessage.classList.remove("error", "success");
}

function showAppStatus(message, type = "error") {
    if (!ui.appStatusMessage) {
        return;
    }

    ui.appStatusMessage.innerText = message;
    ui.appStatusMessage.classList.toggle("error", type === "error");
    ui.appStatusMessage.classList.toggle("success", type === "success");
    ui.appStatusMessage.style.display = "block";
}

function showUserError(message) {
    if (typeof isMobileDevice === "function" && !isMobileDevice()) {
        clearAppStatus();
        alert(message);
        return;
    }

    showAppStatus(message, "error");
}

function showUserSuccess(message) {
    showAppStatus(message, "success");
}

function resetExportCancel() {
    exportCancelRequested = false;

    if (ui.cancelExportBtn) {
        ui.cancelExportBtn.disabled = false;
        ui.cancelExportBtn.innerText = "បោះបង់";
    }
}

function setCancelButtonVisibility(active) {
    if (!ui.cancelExportBtn) {
        return;
    }

    ui.cancelExportBtn.style.display = active ? "block" : "none";
}

function setProcessingState(active) {
    isProcessing = active;
    setCancelButtonVisibility(active);

    if (active) {
        resetExportCancel();
    } else {
        exportCancelRequested = false;
    }

    if (!active && pendingAppReload) {
        pendingAppReload = false;
        reloadForPendingUpdate();
    }
}

function requestExportCancel() {
    if (!isProcessing) {
        return;
    }

    exportCancelRequested = true;

    if (ui.cancelExportBtn) {
        ui.cancelExportBtn.disabled = true;
        ui.cancelExportBtn.innerText = "កំពុងបោះបង់...";
    }

    if (ui.progressText) {
        ui.progressText.innerText = "នឹងបោះបង់បន្ទាប់ពីរូបបច្ចុប្បន្ន...";
    }

    if (
        mobileShareState &&
        mobileShareState.isReadyToShare &&
        mobileShareState.currentFiles &&
        mobileShareState.currentFiles.length > 0 &&
        typeof showProcessingCancelled === "function"
    ) {
        showProcessingCancelled();
    }
}

function createExportCancelledError() {
    const error = new Error("Export canceled");
    error.name = "ExportCancelledError";
    return error;
}

function throwIfExportCancelled() {
    if (exportCancelRequested) {
        throw createExportCancelledError();
    }
}

function isExportCancelledError(error) {
    return Boolean(error && error.name === "ExportCancelledError");
}

function requestSafeAppReload() {
    if (isProcessing) {
        pendingAppReload = true;
        return;
    }

    reloadForPendingUpdate();
}

window.logoAdderPwaState = {
    isProcessingActive: () => isProcessing,
    requestSafeReload: requestSafeAppReload
};

function resetExportSummary() {
    exportSummaryState = null;
    exportFailureItems = [];

    if (!ui.exportSummaryCard) {
        return;
    }

    ui.exportSummaryCard.style.display = "none";
    ui.exportSummaryTitle.innerText = "ស្ថានភាពការដំណើរការ";
    ui.exportSummarySaved.innerText = "0 / 0";
    ui.exportSummarySkipped.innerText = "0";
    ui.exportSummaryDestination.innerText = "-";
    ui.exportSummaryCurrentFile.innerText = "-";
    ui.exportSummaryStatus.innerText = "កំពុងរៀបចំ...";
    ui.exportSummaryNote.innerText = "";
}

function renderExportSummary() {
    if (!ui.exportSummaryCard || !exportSummaryState) {
        return;
    }

    ui.exportSummaryCard.style.display = exportSummaryState.visible ? "block" : "none";
    if (!exportSummaryState.visible) {
        return;
    }

    ui.exportSummaryTitle.innerText = exportSummaryState.title;
    ui.exportSummarySaved.innerText = `${exportSummaryState.saved} / ${exportSummaryState.total}`;
    ui.exportSummarySkipped.innerText = `${exportSummaryState.skipped}`;
    ui.exportSummaryDestination.innerText = exportSummaryState.destination || "-";
    ui.exportSummaryCurrentFile.innerText = exportSummaryState.currentFile || "-";
    ui.exportSummaryStatus.innerText = exportSummaryState.status;
    ui.exportSummaryNote.innerText = exportSummaryState.note || "";
}

function beginExportSummary({ title, total, status, visible, destination = "-", currentFile = "-", note = "" }) {
    exportSummaryState = {
        currentFile,
        destination,
        note,
        saved: 0,
        skipped: 0,
        status,
        title,
        total,
        visible
    };
    renderExportSummary();
}

function updateExportSummary({ saved, skipped, status, visible, destination, currentFile, note }) {
    if (!exportSummaryState) {
        return;
    }

    if (typeof saved === "number") {
        exportSummaryState.saved = saved;
    }

    if (typeof skipped === "number") {
        exportSummaryState.skipped = skipped;
    }

    if (typeof status === "string") {
        exportSummaryState.status = status;
    }

    if (typeof destination === "string") {
        exportSummaryState.destination = destination;
    }

    if (typeof currentFile === "string") {
        exportSummaryState.currentFile = currentFile;
    }

    if (typeof note === "string") {
        exportSummaryState.note = note;
    }

    if (typeof visible === "boolean") {
        exportSummaryState.visible = visible;
    }

    renderExportSummary();
}

function setCompactProgressSummary() {
    if (!exportSummaryState) {
        return;
    }

    updateExportSummary({
        currentFile: "-",
        destination: "-",
        note: ""
    });
}

function setDetailedCompletionSummary({ destination, note }) {
    if (!exportSummaryState) {
        return;
    }

    updateExportSummary({
        currentFile: "បញ្ចប់",
        destination: destination || "-",
        note: note || ""
    });
}

function getSelectedQualityPreset() {
    return ui.qualityPreset && QUALITY_PRESET_MAP[ui.qualityPreset.value]
        ? ui.qualityPreset.value
        : "high";
}

function getSelectedSizePreset() {
    return ui.sizePreset && SIZE_PRESET_MAP[ui.sizePreset.value]
        ? ui.sizePreset.value
        : "original";
}

function getCurrentExportQuality() {
    return QUALITY_PRESET_MAP[getSelectedQualityPreset()];
}

function getCurrentMaxOutputPixels() {
    return SIZE_PRESET_MAP[getSelectedSizePreset()];
}

function hasSeenGuidance() {
    return localStorage.getItem(GUIDANCE_VERSION_KEY) === "1";
}

function markGuidanceSeen() {
    localStorage.setItem(GUIDANCE_VERSION_KEY, "1");
}

function getGuidanceContent() {
    if (canUseAndroidFolderSave()) {
        return "ជ្រើសFolderសម្រាប់រក្សាទុករូបម្តងដំបូង។ Chrome អាចសួរ អនុញ្ញាត ម្តងទៀត ហើយអ្នកអាចចុច ប្តូរFolderរក្សាទុក ដើម្បីផ្លាស់ប្តូរFolderពេលក្រោយ។";
    }

    if (isMobileDevice()) {
        return "លើ iPhone កម្មវិធីនឹងរៀបចំរូបជាក្រុម ហើយបើកMenu Share/Save នៅពេលរូបរួចរាល់។";
    }

    return "";
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

function formatDisplayFileName(fileOrName, maxLength = 36) {
    const rawName = typeof fileOrName === "string"
        ? fileOrName
        : fileOrName && fileOrName.name
            ? fileOrName.name
            : "image";

    if (rawName.length <= maxLength) {
        return rawName;
    }

    return `${rawName.slice(0, maxLength - 1)}…`;
}

function summarizeFailureReason(error) {
    if (!error || !error.message) {
        return "មិនអាចដំណើរការបាន";
    }

    const message = error.message.toLowerCase();

    if (message.includes("timed out")) {
        return "អស់ពេលរង់ចាំ";
    }

    if (message.includes("heic conversion failed")) {
        return "បំលែង HEIC មិនបាន";
    }

    if (message.includes("image load failed")) {
        return "បើករូបមិនបាន";
    }

    if (message.includes("canvas export failed")) {
        return "រក្សារូបមិនបាន";
    }

    return error.message;
}

function recordFailedFile(file, error) {
    exportFailureItems.push({
        fileName: file && file.name ? file.name : "image",
        reason: summarizeFailureReason(error)
    });
}

function buildFailureSummaryNote() {
    if (exportFailureItems.length === 0) {
        return "";
    }

    const lastFailure = exportFailureItems[exportFailureItems.length - 1];
    return `បានរំលង ${exportFailureItems.length} ឯកសារ • ចុងក្រោយ: ${formatDisplayFileName(lastFailure.fileName, 28)} (${lastFailure.reason})`;
}

function buildCurrentFileProgressText(actionLabel, file, currentIndex, totalCount) {
    return `${actionLabel} ${currentIndex}/${totalCount}: ${formatDisplayFileName(file)}`;
}

function setPreviewFallback(message) {
    currentPreviewImg = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ui.placeholderText) {
        ui.placeholderText.innerText = message || DEFAULT_PLACEHOLDER_TEXT;
    }
    if (ui.canvasPlaceholder) {
        ui.canvasPlaceholder.style.display = 'flex';
    }
    canvas.classList.remove('active-canvas');
}

function clearPreviewFallback() {
    if (ui.placeholderText) {
        ui.placeholderText.innerText = DEFAULT_PLACEHOLDER_TEXT;
    }
    if (ui.canvasPlaceholder && bgFiles.length > 0) {
        ui.canvasPlaceholder.style.display = 'none';
    }
    if (bgFiles.length > 0) {
        canvas.classList.add('active-canvas');
    }
}

async function processAndroidBatchFile(file) {
    const workCanvas = document.createElement('canvas');

    try {
        const result = await withTimeout(
            processImageToBlob(file, workCanvas),
            ANDROID_FILE_TIMEOUT_MS,
            `HEIC processing timed out: ${file.name}`
        );

        return { ok: true, ...result };
    } catch (error) {
        return { ok: false, error };
    } finally {
        resetCanvas(workCanvas);
    }
}

// ==========================================
// SECTOR 2: CONFIGURATION & PERSISTENCE
// ==========================================
function saveConfig(logoBase64 = null) {
    const config = {
        marginX: ui.marginX.value,
        marginY: ui.marginY.value,
        qualityPreset: getSelectedQualityPreset(),
        size: ui.sizeSlider.value,
        sizePreset: getSelectedSizePreset(),
        opacity: ui.logoOpacity.value,
        position: hiddenPosInput.value
    };

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

    if (logoBase64) {
        localStorage.setItem(PERSISTENT_LOGO_KEY, logoBase64);
    }
}

async function loadConfig() {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    const savedLogo = localStorage.getItem(PERSISTENT_LOGO_KEY);

    if (saved) {
        const config = JSON.parse(saved);
        ui.marginX.value = config.marginX;
        ui.marginY.value = config.marginY;
        ui.sizeSlider.value = config.size;
        ui.sizeVal.innerText = config.size + "%";
        ui.logoOpacity.value = config.opacity;
        ui.opacityVal.innerText = config.opacity + "%";
        if (ui.qualityPreset) {
            ui.qualityPreset.value = QUALITY_PRESET_MAP[config.qualityPreset] ? config.qualityPreset : "high";
        }
        if (ui.sizePreset) {
            ui.sizePreset.value = SIZE_PRESET_MAP[config.sizePreset] ? config.sizePreset : "original";
        }
        updatePositionUI(config.position);
        if (typeof syncPhotoEditControls === "function") {
            syncPhotoEditControls();
        }
    }

    if (savedLogo) {
        logoImg = new Image();
        logoImg.onload = () => {
            ui.logoStatus.innerText = "Logo: បញ្ចូលស្វ័យប្រវត្តិ (Auto-Loaded)";
            draw();
        };
        logoImg.src = savedLogo;
    }
}

// ==========================================
