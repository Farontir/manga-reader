# Notes for App Review

To paste into App Store Connect → App Review Information → Notes, in English for the
reviewer. Keep this file up to date with every feature that is not visible at first glance
(guideline 2.3.1).

---

Kumo Reader ships with no content and no bundled source. Users read their own files
(CBZ/images) or add extensions from a URL of their choice.

**Sensitive content privacy (hidden by default)**

Titles classified as sensitive (rated "erotica" or "pornographic" by their source, marked
adult on AniList, or marked by the user via the "⋯" menu of a title page → "Marquer comme
sensible") are hidden everywhere in the app by default: library, unread counts, search,
Discover, catalogue and categories. Hiding never deletes anything: backups, reading
progress and downloads stay complete.

- **Show them for the current session:** long-press the "Bibliothèque" (Library) title for
  about one second, then authenticate with Face ID (or the device passcode). A small dot
  next to the title shows they are visible. Long-press the title again to hide them at
  once. They are hidden again automatically as soon as the app goes to the background.
- **Setting:** Réglages (Settings) → Confidentialité → "Masquer le contenu sensible", on by
  default. Turning it off requires Face ID or the device passcode; turning it back on does
  not.
- While the app is inactive (app switcher), a neutral screen covers it so its preview never
  shows a title.

Face ID is only used for this purpose (NSFaceIDUsageDescription). Nothing is sent off the
device.

**Testing it:** with the MangaDex English extension installed
(`https://farontir.github.io/manga-reader/mangadex/`), Discover → Catégories shows the
"Adult" category only after the long press and Face ID above.
