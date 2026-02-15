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
- The delete action uses YouTube Music's row menu item text, so ensure your UI language is set to English for the best results.
