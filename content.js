const WAIT_BETWEEN_ACTIONS_MS = 500;
const MENU_WAIT_TIMEOUT_MS = 5000;
const OVERFLOW_LABEL_TOKENS = ["more", "actions", "menu"];
const UNSAFE_LABEL_TOKENS = ["like", "dislike", "thumb"];
const PLAYLIST_REMOVE_PHRASES = [
  "remove from playlist",
  "remove from this playlist",
  "delete from playlist"
];

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

function getButtonLabel(button) {
  if (!button) return "";

  const direct = normalizeText(
    button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      button.textContent ||
      ""
  );
  const nested = normalizeText(
    button.querySelector("[aria-label]")?.getAttribute("aria-label") || ""
  );

  return [direct, nested].filter(Boolean).join(" ");
}

function isSafeOverflowMenuButton(button) {
  if (!button) return false;
  if (!button.closest("ytmusic-menu-renderer")) return false;

  const label = getButtonLabel(button);
  if (!label) return false;
  if (UNSAFE_LABEL_TOKENS.some((token) => label.includes(token))) return false;

  return OVERFLOW_LABEL_TOKENS.some((token) => label.includes(token));
}

function getSafeMenuButton(row) {
  const candidates = Array.from(
    row.querySelectorAll("ytmusic-menu-renderer yt-icon-button button, ytmusic-menu-renderer button")
  );

  for (const button of candidates) {
    if (isSafeOverflowMenuButton(button)) return button;
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
  ).filter((item) => {
    const style = window.getComputedStyle(item);
    const hasLayout = item.getClientRects().length > 0;
    return style.display !== "none" && style.visibility !== "hidden" && hasLayout;
  });
}

function getMenuItemText(item) {
  if (!item) return "";

  const label = normalizeText(item.getAttribute("aria-label") || "");
  const nestedLabel = normalizeText(
    item.querySelector("[aria-label]")?.getAttribute("aria-label") || ""
  );
  const formatted = normalizeText(
    item.querySelector("yt-formatted-string")?.textContent || ""
  );
  const text = normalizeText(item.textContent || "");

  return [label, nestedLabel, formatted, text].filter(Boolean).join(" ");
}

function isPlaylistRemoveText(text) {
  return PLAYLIST_REMOVE_PHRASES.some((phrase) => text.includes(phrase));
}

function dismissOpenMenus() {
  document.body.click();
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
}

function findRemoveItem(items) {
  for (const item of items) {
    const text = getMenuItemText(item);
    if (isPlaylistRemoveText(text)) return item;
  }
  return null;
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

  const menuButton = getSafeMenuButton(track.row);
  if (!menuButton) {
    return {
      removed: false,
      reason: "safe overflow menu button not found",
      fatal: true
    };
  }

  menuButton.click();
  const removeItem = await waitForRemoveMenuItem(MENU_WAIT_TIMEOUT_MS);
  if (!removeItem) {
    dismissOpenMenus();
    return {
      removed: false,
      reason: "playlist-specific remove action not found",
      fatal: true
    };
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
  let aborted = false;
  let abortReason = null;

  for (const track of targets) {
    const result = await clickRemoveForRow(track);
    if (result.removed) {
      removedCount += 1;
    } else if (result.fatal) {
      aborted = true;
      abortReason = `${track.title}: ${result.reason}`;
      break;
    } else {
      failed.push(`${track.title} (${result.reason})`);
    }
    await sleep(WAIT_BETWEEN_ACTIONS_MS);
  }

  return {
    totalTracks: scanResult.totalTracks,
    duplicateCount: scanResult.duplicateCount,
    removedCount,
    failed,
    aborted,
    abortReason
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
