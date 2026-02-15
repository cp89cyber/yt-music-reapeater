# YT Music Duplicate Remover (Chrome Extension)

Chrome extension to scan a YouTube Music playlist for duplicate songs and remove repeats.

## Install (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/home/culpen0/yt-music repeater`.

## Use

1. Open a playlist at `https://music.youtube.com/`.
2. Click the extension icon.
3. Click **Scan Playlist** to list duplicates.
4. Click **Delete Repeats** to remove duplicate entries (keeps one copy).

## Notes

- Duplicate matching is based on YouTube track `videoId` first, then title + subtitle text fallback.
- The delete action uses YouTube Music's row menu item text (`Remove from playlist`/similar English labels), so a refresh and retry may help if UI timing changes.
