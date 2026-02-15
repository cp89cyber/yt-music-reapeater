# YouTube Music Repeater

Clean up your YouTube Music playlists in seconds. This Chrome extension scans for duplicate songs and removes repeats automatically, keeping just one clean copy of each track.

## Features
- Scans playlists for duplicate songs.
- Removes repeats automatically based on track `videoId` or title matching.
- Simple UI for quick cleanup.

## Install (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project folder.

## Use

1. Open a playlist at `https://music.youtube.com/`.
2. Click the extension icon.
3. Click **Scan Playlist** to list duplicates.
4. Click **Delete Repeats** to remove duplicate entries (keeps one copy).

## Notes

- Duplicate matching is based on YouTube track `videoId` first, then title + subtitle text fallback.
- The delete action is intentionally strict and English-only: it only clicks a row overflow menu with an action-style label and only accepts playlist-specific remove text.
- If a safe menu target or playlist remove action cannot be confirmed, the run aborts immediately to avoid accidental clicks on non-menu controls.
