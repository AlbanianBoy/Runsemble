# Runsemble — Play Store release runbook

Click-by-click steps to get the app onto Google Play. Pair this with
[`play-store-listing.md`](./play-store-listing.md) (all the copy-paste text).

**What you're shipping:** a thin native Android shell (`net.runsemble.app`) that
loads the live site `runsemble.net` and adds native background GPS. So a code
change to the app itself just needs a `git push` (the site updates) — you only
rebuild the `.aab` when the *native* part changes (icon, permissions, plugins)
or Play needs a fresh upload.

---

## ✅ Already done (verified)
- App icon (teal "R"), adaptive icon, splash screens — generated into the project.
- `capacitor.config.ts` → `appId: net.runsemble.app`, loads `https://runsemble.net`.
- `versionCode 1 / versionName "1.0"` — correct for a first upload.
- Permissions declared (location, background location, foreground service, notifications).
- Privacy policy live at https://runsemble.net/privacy (Play requires this).
- Store graphics: `store/play-icon-512.png` (512×512), `store/feature-graphic.png` (1024×500).
- Listing copy, data-safety answers, content-rating answers, background-location
  justification — all written in `play-store-listing.md`.

## ⏳ The one thing still missing
- **Phone screenshots** (Play requires at least 2; use 4–6). See Step C below.

---

## Step A — Build the signed `.aab` in Android Studio

1. Open the project: in Android Studio, **Open** → select the `android/` folder.
   Let Gradle sync finish (bottom status bar).
2. Menu: **Build → Generate Signed App Bundle / APK…**
3. Choose **Android App Bundle** → **Next**.
4. Under *Key store path*, click **Create new…** (first time only):
   - **Key store path:** save it somewhere permanent, e.g.
     `C:\Users\arian\runsemble-upload-key.jks`
   - **Password:** pick a strong one (twice).
   - **Alias:** `runsemble`
   - **Key password:** can be the same as the keystore password.
   - **Validity (years):** `30`
   - **Certificate:** fill your name / org (Runsemble) — country `BE`.
   - **OK**.

   > 🔐 **CRITICAL — back this up before you go further.** The `.jks` file **and**
   > both passwords are the *only* way to publish updates to this app, ever.
   > Lose them and you can't update Runsemble again (you'd have to ship a brand-new
   > app with a new package name). **Put the `.jks` in your password manager /
   > cloud backup and save the passwords there too.** Do not commit it to git.

5. Back on the dialog: keystore path + passwords + alias filled → **Next**.
6. Build variant: **release**. (Destination folder is fine as default.) → **Finish/Create**.
7. When it finishes, Android Studio shows a "locate" link. The file is at:
   `android/app/release/app-release.aab` ← this is what you upload.

*(If the build errors out, copy the red error text to me and I'll help fix it —
that's the step where any compile problem would surface.)*

## Step B — Play Console

1. https://play.google.com/console → **Create app**.
   - App name: `Runsemble: Run Together` · English · **App** · **Free**.
   - Accept the declarations → **Create**.
2. **Recommended: start on a testing track, not Production.** Left menu →
   **Testing → Internal testing → Create new release**.
3. **App bundle:** upload `app-release.aab`. (First upload: Play offers **Play App
   Signing** — accept it. Your `.jks` becomes the *upload* key; Google manages the
   final signing key.)
4. Release name auto-fills (e.g. `1 (1.0)`). Add a one-line "what's new". **Save → Review**.
5. Now clear the **"App content"** checklist (left menu → *Policy → App content*).
   Paste from `play-store-listing.md`:
   - **Privacy policy:** `https://runsemble.net/privacy`
   - **Data safety:** use the table in the listing pack.
   - **Content rating:** answer the questionnaire (UGC + approx location sharing → Teen).
   - **Ads:** No.
   - **Target audience:** 18+ (or 13+ — your call; 18+ is simpler with location).
   - **Government app / financial:** No.
   - **⚠️ Location permissions / Background location:** Play *will* ask you to justify
     `ACCESS_BACKGROUND_LOCATION`. Paste the justification from the listing pack.
     Be ready to record a short **demo video** (permission prompt → start a run →
     the "tracking your run" notification). *(This is the step most likely to add
     review time — see the note below.)*
6. **Store listing** (left menu → *Grow → Store presence → Main store listing*):
   short + full description, then upload **app icon** (`play-icon-512.png`),
   **feature graphic** (`feature-graphic.png`), and **phone screenshots** (Step C).
7. Back to **Internal testing → Testers**: add your pilot runners' emails, copy the
   **opt-in link**, and send it to them.
8. **Review release → Start rollout to Internal testing.** Internal testing is
   usually available to your testers within minutes to a couple of hours.

## Step C — Capture the phone screenshots (the missing piece)

Play needs **2–8 phone screenshots**. Grab 4–6 of the best screens:
1. Run the app (emulator or your phone via the internal-testing link once it's live,
   or the emulator you already set up).
2. Capture: **the map** (runners nearby), **a live run** (tracking screen), **the
   feed**, **a group**, **the leaderboard**, **your profile**.
3. On the emulator: the camera icon in the side toolbar saves a PNG. On a phone:
   power + volume-down.
4. Upload them in the Store listing. (Tip: portrait, clean status bar.)

*If you'd rather, run the app in the emulator and I can tell you exactly which
frames to grab so the set looks cohesive.*

---

## Going forward — versioning
Every **new** upload to Play must have a **higher** `versionCode` than the last.
For your *next* release, bump it in `android/app/build.gradle`:
```
versionCode 2          // was 1
versionName "1.0.1"    // human-facing, your choice
```
(You do **not** need a new `.aab` for ordinary app changes — those ship by pushing
to `runsemble.net`. Only rebuild when the native shell changes or Play needs a new upload.)

## Common first-submission snags (and how you've avoided them)
- ❌ *Missing privacy policy* → ✅ live at `/privacy`.
- ❌ *Background location with no justification* → ✅ justification written; just be
  ready for the demo video.
- ❌ *"Minimum functionality" rejection for webview apps* → low risk: Runsemble adds
  real native value (background GPS), which is exactly what Google looks for.
- ❌ *Data-safety form doesn't match declared permissions* → ✅ the listing pack's
  table already matches the manifest (approx + precise location, incl. background).
- ⏳ *Screenshots* → the one thing left to capture.

---

**Bottom line:** build the signed bundle (Step A — mind the keystore backup),
create the app on the internal-testing track (Step B), grab a handful of
screenshots (Step C), paste the listing text, and roll out to your pilot.
