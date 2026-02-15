const WAIT_BETWEEN_ACTIONS_MS = 500;
const MENU_WAIT_TIMEOUT_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(input) {
  return (input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackRows() {
  return Array.from(
    document.querySelectorAll("ytmusic-responsive-list-item-renderer")
  ).filter((row) => row.querySelector('a[href*="watch?v="]'));
}

function isPlaylistPage() {
  return (
    location.pathname === "/playlist" ||
    new URLSearchParams(location.search).has("list")
  );
}

function getMenuButton(row) {
  const selectors = [
    "ytmusic-menu-renderer yt-icon-button button",
    "ytmusic-menu-renderer button",
    '#menu yt-icon-button button',
    '#menu button[aria-label]'
  ];

  for (const selector of selectors) {
    const button = row.querySelector(selector);
    if (button) return button;
  }

  return null;
}

function extractTrackFromRow(row, index) {
  const titleLink = row.querySelector('a[href*="watch?v="]');
  if (!titleLink) return null;

  let videoId = "";
  try {
    const url = new URL(titleLink.href, location.origin);
    videoId = url.searchParams.get("v") || "";
  } catch {
    videoId = "";
  }

  const title = (titleLink.textContent || "").trim() || "Unknown title";
  const subtitle = row.querySelector("#subtitle");
  const artists = subtitle ? (subtitle.textContent || "").replace(/\s+/g, " ").trim() : "";
  const key = videoId
    ? `id:${videoId}`
    : `${normalizeText(title)}|${normalizeText(artists)}`;

  return {
    row,
    index,
    key,
    title,
    artists,
    videoId
  };
}

function findDuplicates() {
  const rows = getTrackRows();
  const seen = new Map();
  const duplicates = [];
  let idx = 0;

  for (const row of rows) {
    const track = extractTrackFromRow(row, idx);
    idx += 1;
    if (!track || !track.key) continue;

    if (seen.has(track.key)) {
      duplicates.push(track);
    } else {
      seen.set(track.key, track);
    }
  }

  return {
    totalTracks: rows.length,
    duplicateCount: duplicates.length,
    duplicates
  };
}

function getOpenMenuItems() {
  return Array.from(
    document.querySelectorAll(
      "ytmusic-menu-service-item-renderer, ytmusic-menu-navigation-item-renderer, tp-yt-paper-item, [role='menuitem']"
    )
  );
}

function getText(node) {
  return normalizeText(node?.textContent || "");
}

function dismissOpenMenus() {
  document.body.click();
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
}

function findRemoveItem(items) {
  return items.find((item) => {
    const text = getText(item);
    return (
      text.includes("remove from playlist") ||
      text.includes("delete from playlist") ||
      text.includes("remove from this playlist")
    );
  });
}

async function waitForRemoveMenuItem(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const items = getOpenMenuItems();
    const removeItem = findRemoveItem(items);
    if (removeItem) return removeItem;
    await sleep(100);
  }
  return null;
}

async function loadEntirePlaylist(maxPasses = 80) {
  let lastCount = 0;
  let stablePasses = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const rows = getTrackRows();
    if (!rows.length) break;

    rows[rows.length - 1].scrollIntoView({ block: "end", behavior: "auto" });
    await sleep(350);

    const count = getTrackRows().length;
    if (count <= lastCount) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
      lastCount = count;
    }

    if (stablePasses >= 5) break;
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  await sleep(120);
}

async function clickRemoveForRow(track) {
  if (!document.contains(track.row)) {
    return { removed: false, reason: "row disappeared before delete" };
  }

  track.row.scrollIntoView({ block: "center", behavior: "auto" });
  await sleep(120);

  const menuButton = getMenuButton(track.row);
  if (!menuButton) {
    return { removed: false, reason: "menu button not found" };
  }

  menuButton.click();
  const removeItem = await waitForRemoveMenuItem(MENU_WAIT_TIMEOUT_MS);
  if (!removeItem) {
    dismissOpenMenus();
    return { removed: false, reason: "remove action not found in menu" };
  }

  removeItem.click();

  const removeStart = Date.now();
  while (Date.now() - removeStart < 6000) {
    if (!document.contains(track.row)) {
      return { removed: true };
    }
    await sleep(120);
  }

  return { removed: false, reason: "row did not disappear after click" };
}

async function deleteDuplicates() {
  if (!isPlaylistPage()) {
    throw new Error("Open a YouTube Music playlist page first.");
  }

  await loadEntirePlaylist();
  const scanResult = findDuplicates();
  const targets = [...scanResult.duplicates].sort((a, b) => b.index - a.index);
  const failed = [];
  let removedCount = 0;

  for (const track of targets) {
    const result = await clickRemoveForRow(track);
    if (result.removed) {
      removedCount += 1;
    } else {
      failed.push(`${track.title} (${result.reason})`);
    }
    await sleep(WAIT_BETWEEN_ACTIONS_MS);
  }

  return {
    totalTracks: scanResult.totalTracks,
    duplicateCount: scanResult.duplicateCount,
    removedCount,
    failed
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === "SCAN_DUPLICATES") {
    (async () => {
      try {
        if (!isPlaylistPage()) {
          throw new Error("Open a YouTube Music playlist page first.");
        }

        await loadEntirePlaylist();
        const result = findDuplicates();
        sendResponse({
          ok: true,
          result: {
            totalTracks: result.totalTracks,
            duplicateCount: result.duplicateCount,
            duplicates: result.duplicates.map((track) => ({
              title: track.title,
              artists: track.artists,
              videoId: track.videoId
            }))
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Scan failed." });
      }
    })();
    return true;
  }

  if (message.type === "DELETE_DUPLICATES") {
    deleteDuplicates()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({ ok: false, error: error.message || "Delete failed." })
      );
    return true;
  }
});
