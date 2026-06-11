async function startAndroidChromeFolderExport(btn) {
    let allowRetryWithFreshPicker = true;

    while (true) {
        try {
            beginExportSummary({
                title: "ស្ថានភាពការរក្សាទុក",
                total: bgFiles.length,
                status: "កំពុងរក្សាទុកទៅFolderដែលបានជ្រើស",
                visible: true
            });
            setCompactProgressSummary();

            const restoredHandle = await restorePersistedAndroidDirectoryHandle();
            ui.progressText.innerText = restoredHandle
                ? "កំពុងប្រើFolderដែលបានចងចាំ"
                : "សូមជ្រើសFolderក្នុង Pictures ដើម្បីរក្សាទុករូប";
            const directoryHandle = restoredHandle || await chooseAndroidSaveDirectory();
            let permissionState = await queryDirectoryPermission(directoryHandle);

            if (permissionState !== "granted") {
                ui.progressText.innerText = restoredHandle
                    ? "Folderត្រូវបានចងចាំរួចហើយ សូមចុច អនុញ្ញាត ដើម្បីរក្សាទុករូប"
                    : "Chrome ត្រូវការការអនុញ្ញាត ដើម្បីរក្សាទុករូបទៅFolderដែលបានជ្រើស";
                permissionState = await requestDirectoryPermission(directoryHandle);
            }

            if (permissionState !== "granted") {
                throw new Error("Stored directory permission denied");
            }

            const existingDirectoryFileNames = await collectExistingDirectoryFileNames(directoryHandle);
            let savedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < bgFiles.length; i++) {
                throwIfExportCancelled();
                const progressMessage = buildCurrentFileProgressText("កំពុងដំណើរការ", bgFiles[i], i + 1, bgFiles.length);
                updateExportProgress(i, bgFiles.length, progressMessage);
                const result = await processAndroidBatchFile(bgFiles[i]);
                throwIfExportCancelled();

                if (result.ok) {
                    const fileName = getMobileOutputFileName(bgFiles[i]);
                    addResultPreview(result.previewBlob);
                    await writeBlobToDirectory(directoryHandle, fileName, result.outputBlob, existingDirectoryFileNames);
                    savedCount += 1;
                } else {
                    skippedCount += 1;
                    recordFailedFile(bgFiles[i], result.error);
                }

                updateExportProgress(i + 1, bgFiles.length, progressMessage);
                updateExportSummary({
                    saved: savedCount,
                    skipped: skippedCount,
                    status: skippedCount > 0
                        ? `កំពុងរក្សាទុកទៅFolderដែលបានជ្រើស • បានរំលង ${skippedCount} រូប`
                        : "កំពុងរក្សាទុកទៅFolderដែលបានជ្រើស"
                });
                const recoveryDelay = result.ok
                    ? (isHeicFile(bgFiles[i]) ? ANDROID_HEIC_COOLDOWN_MS : 0)
                    : 250;
                await yieldToBrowser(recoveryDelay);
            }

            setPrimaryButtonState(false, "ចាប់ផ្តើមជាថ្មី!");
            zipContainer.style.display = "none";
            showAndroidSaveComplete(savedCount);
            setDetailedCompletionSummary({
                destination: "ថតដែលបានជ្រើស",
                note: buildFailureSummaryNote()
            });
            updateExportSummary({
                saved: savedCount,
                skipped: skippedCount,
                status: skippedCount > 0
                    ? `រួចរាល់ • បានរំលង ${skippedCount} រូប`
                    : "រួចរាល់"
            });
            setProcessingState(false);
            resultsSection.scrollIntoView({ behavior: 'smooth' });
            return;
        } catch (error) {
            if (isExportCancelledError(error)) {
                showProcessingCancelled();
                return;
            }

            if (error.name === "AbortError") {
                zipContainer.style.display = "none";
                setProcessingState(false);
                resetExportSummary();
                setPrimaryButtonState(false, "ចាប់ផ្ដើមដំណើរការ");
                ui.progressText.innerText = "បានបោះបង់ការជ្រើសFolder";
                ui.progressCount.innerText = `0 / ${bgFiles.length}`;
                ui.progressFill.style.width = "0%";
                return;
            }

            await resetAndroidFolderSaveState();

            if (allowRetryWithFreshPicker) {
                allowRetryWithFreshPicker = false;
                ui.progressText.innerText = "សូមជ្រើសFolderថ្មីដើម្បីរក្សាទុករូប";
                continue;
            }

            ui.progressText.innerText = "កំពុងប្តូរទៅការទាញយកជំនួស...";
            resetExportState();
            await startZipExport(btn, { chunked: true });
            return;
        }
    }
}

async function startMobileShareFlow(btn) {
    mobileShareState = {
        nextIndex: 0,
        total: bgFiles.length,
        currentFiles: [],
        currentLabel: "",
        isReadyToShare: false
    };

    ui.progressText.innerText = "កំពុងរៀបចំ 10 រូបដំបូង...";
    await prepareNextMobileShareBatch(btn);
}

async function prepareNextMobileShareBatch(btn) {
    if (!mobileShareState) return;

    const offCanvas = document.createElement('canvas');
    const start = mobileShareState.nextIndex;
    const end = Math.min(start + MOBILE_SHARE_BATCH_SIZE, mobileShareState.total);

    try {
        mobileShareState.currentFiles = [];
        mobileShareState.currentLabel = `${start + 1}-${end}`;
        mobileShareState.isReadyToShare = false;

        for (let i = start; i < end; i++) {
            throwIfExportCancelled();
            const progressMessage = buildCurrentFileProgressText("កំពុងរៀបចំ", bgFiles[i], i + 1, mobileShareState.total);
            updateExportProgress(i, mobileShareState.total, progressMessage);
            const { outputBlob, previewBlob } = await processImageToBlob(bgFiles[i], offCanvas);
            throwIfExportCancelled();
            const outputName = getMobileOutputFileName(bgFiles[i]);
            const shareFile = new File([outputBlob], outputName, { type: "image/jpeg" });

            mobileShareState.currentFiles.push(shareFile);
            addResultPreview(previewBlob);
            updateExportProgress(i + 1, mobileShareState.total, progressMessage);
            await yieldToBrowser();
        }

        resetCanvas(offCanvas);

        if (!canShareFiles(mobileShareState.currentFiles)) {
            mobileShareState = null;
            await startZipExport(btn, { chunked: true });
            return;
        }

        zipContainer.style.display = "block";
        ui.finalZipBtn.disabled = false;
        ui.finalZipBtn.innerText = `Save ${mobileShareState.currentLabel} Photos`;
        ui.progressText.innerText = `រូប ${mobileShareState.currentLabel} រួចរាល់`;
        setPrimaryButtonState(true, "ចុច Save Photos ខាងក្រោម");
        mobileShareState.isReadyToShare = true;
    } catch (error) {
        resetCanvas(offCanvas);
        mobileShareState = null;
        if (isExportCancelledError(error)) {
            showProcessingCancelled();
            return;
        }

        showProcessingError(error);
    }
}

async function sharePreparedMobileBatch() {
    if (!mobileShareState || mobileShareState.currentFiles.length === 0) return;

    const btn = ui.downloadBtn;
    const shareBtn = ui.finalZipBtn;
    const sharedCount = mobileShareState.currentFiles.length;
    const batchEnd = mobileShareState.nextIndex + sharedCount;

    try {
        shareBtn.disabled = true;
        mobileShareState.isReadyToShare = false;
        await navigator.share({
            files: mobileShareState.currentFiles,
            title: "LogoAdder Photos"
        });

        mobileShareState.nextIndex = batchEnd;
        mobileShareState.currentFiles = [];

        if (mobileShareState.nextIndex >= mobileShareState.total) {
            setPrimaryButtonState(false, "ចាប់ផ្តើមជាថ្មី!");
            shareBtn.disabled = false;
            zipContainer.style.display = "none";
            ui.progressText.innerText = "រួចរាល់! (100%)";
            beginExportSummary({
                title: "ស្ថានភាពការបញ្ចប់",
                total: mobileShareState.total,
                status: "បានចែករំលែក/រក្សាទុករួច",
                visible: true
            });
            setDetailedCompletionSummary({
                destination: "iPhone Share",
                note: buildFailureSummaryNote()
            });
            updateExportSummary({
                saved: mobileShareState.total,
                skipped: 0,
                status: "រួចរាល់"
            });
            setProcessingState(false);
            resultsSection.scrollIntoView({ behavior: 'smooth' });
            mobileShareState = null;
            return;
        }

        setPrimaryButtonState(true, "កំពុងរៀបចំ...");
        ui.progressText.innerText = "កំពុងរៀបចំរូបបន្ទាប់...";
        await prepareNextMobileShareBatch(btn);
        shareBtn.disabled = false;
    } catch (error) {
        shareBtn.disabled = false;
        if (error.name !== "AbortError") {
            showUserError("មិនអាចបើកMenuរក្សាទុក/ចែករំលែកបាន។");
        }
    }
}

async function startZipExport(btn, options = {}) {
    const offCanvas = document.createElement('canvas');
    const useChunkedZip = Boolean(options.chunked);
    const filesPerZip = useChunkedZip ? ZIP_CHUNK_SIZE : bgFiles.length;
    const shouldAutoDownloadChunks = useChunkedZip && bgFiles.length > AUTO_DOWNLOAD_THRESHOLD;

    try {
        await ensureJSZipLoaded();
        throwIfExportCancelled();

        for (let start = 0; start < bgFiles.length; start += filesPerZip) {
            throwIfExportCancelled();
            const zip = new JSZip();
            const end = Math.min(start + filesPerZip, bgFiles.length);
            preconvertDesktopHeicFiles(bgFiles, start, end);

            for (let i = start; i < end; i++) {
                throwIfExportCancelled();
                preconvertDesktopHeicFiles(bgFiles, i, end);
                const progressMessage = buildCurrentFileProgressText("កំពុងដំណើរការ", bgFiles[i], i + 1, bgFiles.length);
                updateExportProgress(i, bgFiles.length, progressMessage);
                const { outputBlob, previewBlob } = await processImageToBlob(bgFiles[i], offCanvas);
                throwIfExportCancelled();

                addResultPreview(previewBlob);
                updateExportProgress(i + 1, bgFiles.length, progressMessage);
                zip.file(`LogoAdder_${i + 1}.jpg`, outputBlob);
                await yieldToBrowser();
            }

            throwIfExportCancelled();
            const zipBlob = await zip.generateAsync({
                type: "blob",
                compression: "STORE",
                streamFiles: true
            });
            throwIfExportCancelled();
            const chunkNumber = Math.floor(start / filesPerZip) + 1;
            const zipName = useChunkedZip && bgFiles.length > filesPerZip
                ? `LogoAdder_Batch_${chunkNumber}.zip`
                : "LogoAdder_Batch.zip";
            const zipUrl = URL.createObjectURL(zipBlob);

            if (shouldAutoDownloadChunks) {
                downloadBlobUrl(zipUrl, zipName);
                scheduleUrlRevoke(zipUrl);
            } else {
                currentZipDownloads.push({ name: zipName, url: zipUrl });
            }

            await yieldToBrowser();
        }

        resetCanvas(offCanvas);
        setPrimaryButtonState(false, "ចាប់ផ្តើមជាថ្មី!");
        setProcessingState(false);
        zipContainer.style.display = shouldAutoDownloadChunks ? "none" : "block";
        if (!shouldAutoDownloadChunks) {
            ui.finalZipBtn.innerText = currentZipDownloads.length > 1
                ? `ទាញយកជា ZIP (${currentZipDownloads.length})`
                : "ទាញយកជា ZIP";
        }
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        resetCanvas(offCanvas);
        if (isExportCancelledError(error)) {
            showProcessingCancelled();
            return;
        }

        showProcessingError(error);
    }
}
