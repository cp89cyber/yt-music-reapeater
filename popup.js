const scanBtn = document.getElementById("scan-btn");
const deleteBtn = document.getElementById("delete-btn");
const statusEl = document.getElementById("status");
const duplicatesListEl = document.getElementById("duplicates-list");

function setStatus(message) {
  statusEl.textContent = message;
}

function clearDuplicates() {
  duplicatesListEl.innerHTML = "";
}

function renderDuplicates(duplicates) {
  clearDuplicates();
  if (!duplicates.length) {
    const li = document.createElement("li");
    li.textContent = "No duplicates found.";
    duplicatesListEl.appendChild(li);
    return;
  }

  for (const item of duplicates) {
    const li = document.createElement("li");
    li.textContent = `${item.title} - ${item.artists || "Unknown artist"}`;
    duplicatesListEl.appendChild(li);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendCommand(type) {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    throw new Error("No active tab found.");
  }

  if (!tab.url.startsWith("https://music.youtube.com/")) {
    throw new Error("Open a YouTube Music playlist tab first.");
  }

  const tabUrl = new URL(tab.url);
  const isPlaylist =
    tabUrl.pathname === "/playlist" || tabUrl.searchParams.has("list");
  if (!isPlaylist) {
    throw new Error("Open a playlist URL first (must include a list).");
  }

  return chrome.tabs.sendMessage(tab.id, { type });
}

function setBusy(isBusy) {
  scanBtn.disabled = isBusy;
  deleteBtn.disabled = isBusy;
}

scanBtn.addEventListener("click", async () => {
  try {
    setBusy(true);
    setStatus("Scanning playlist for repeats...");
    const response = await sendCommand("SCAN_DUPLICATES");

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }

    const { totalTracks, duplicateCount, duplicates } = response.result;
    setStatus(`Scanned ${totalTracks} tracks. Found ${duplicateCount} repeats.`);
    renderDuplicates(duplicates);
  } catch (error) {
    setStatus(`${error.message} If this is a new install, refresh the tab once.`);
    clearDuplicates();
  } finally {
    setBusy(false);
  }
});

deleteBtn.addEventListener("click", async () => {
  try {
    setBusy(true);
    setStatus("Deleting duplicate tracks. Keep this playlist tab open...");
    const response = await sendCommand("DELETE_DUPLICATES");

    if (!response?.ok) {
      throw new Error(response?.error || "Delete failed.");
    }

    const { removedCount, duplicateCount, failed, aborted, abortReason } = response.result;
    if (aborted) {
      setStatus(
        `Safety stop after removing ${removedCount}/${duplicateCount}. ` +
          `Aborted: ${abortReason || "uncertain row action target"}`
      );
    } else {
      setStatus(
        `Removed ${removedCount}/${duplicateCount} duplicates.` +
          (failed.length ? ` Failed: ${failed.slice(0, 3).join(", ")}` : "")
      );
    }
    renderDuplicates([]);
  } catch (error) {
    setStatus(`${error.message} If needed, reload the playlist and try again.`);
  } finally {
    setBusy(false);
  }
});
