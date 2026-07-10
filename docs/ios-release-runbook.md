# Runsemble — iOS release runbook (no Mac required)

The native iPhone app, built on a **cloud Mac** so you don't need to own one.
The code is done and committed; this covers the accounts + cloud-build steps.

**What's already set up (in the repo):**
- `@capacitor/ios` + the `ios/` Xcode project (`net.runsemble.app`), loading
  runsemble.net — same as Android, so 100% of the app is reused.
- iOS app icons + splash (teal "R") generated into `ios/App/App/Assets.xcassets`.
- `Info.plist` configured for background location: "when in use" + "always"
  usage strings and the `location` background mode (the iOS equivalent of the
  Android manifest permissions).
- `codemagic.yaml` — the cloud-build pipeline that builds + signs + ships to
  TestFlight.

**What you still need (unavoidable for any iOS app):**
- 🍎 **Apple Developer Program — $99/year.** Required to build/sign/ship iOS.
- 📱 **A real iPhone** to run the background-GPS walk test (a simulator can't).
- ☁️ A **Codemagic** account (free tier: ~500 macOS build-minutes/month; an iOS
  build is ~10–15 min, so ~30+ builds/month free). This is the cloud Mac.

---

## Step A — Apple side (once)
1. Enrol in the **Apple Developer Program** (developer.apple.com) — $99/yr.
2. In **App Store Connect** → **Apps → +** → create an app:
   - Platform iOS, name "Runsemble", bundle ID **`net.runsemble.app`**
     (register it under Certificates, IDs & Profiles → Identifiers if prompted).
   - Note the **App ID** (the numeric id) — you'll set it as `APP_STORE_APP_ID`.
3. Create an **App Store Connect API key** (Users and Access → Integrations →
   App Store Connect API → +). Download the `.p8`, note the **Key ID** and
   **Issuer ID**. Codemagic uses this to sign + upload without a Mac.

## Step B — Codemagic (once)
1. Sign up at codemagic.io, connect your **GitHub** and pick `Runsemble`.
2. **Teams → Integrations → App Store Connect** → add the API key from A.3.
   Name it **`RunsembleASC`** (must match `integrations.app_store_connect` in
   `codemagic.yaml`).
3. Codemagic auto-detects `codemagic.yaml`. Add a variable (group) with
   **`APP_STORE_APP_ID`** = the numeric App ID from A.2.
4. Code signing: the yaml uses **automatic signing** via the API key —
   Codemagic creates the certificate + provisioning profile for you. No Mac, no
   manual certs.

## Step C — Build
- Start the **`ios-release`** workflow in Codemagic (or push to `main` and set it
  to trigger). It runs `npm ci` → `cap sync ios` → `pod install` → signs →
  builds the `.ipa` → uploads to **TestFlight**. ~10–15 min.

## Step D — Test on a real iPhone (the important part)
1. In **TestFlight** (App Store Connect → your app → TestFlight), add yourself /
   a friend as an internal tester; install the **TestFlight** app on the iPhone
   and get the build.
2. **The walk test — treat iPhone tracking as UNPROVEN until this passes** (iOS
   background rules differ from Android):
   - Open the app, grant location — iOS asks "While Using" first; then you must
     escalate to **"Always"** (Settings → Runsemble → Location → **Always**).
   - Start a run → lock the screen → walk 2–3 min outside → reopen.
   - ✅ continuous route + right distance/time = iOS background GPS works.
   - ❌ gap/short = see the plugin note below.

## Step E — Submit to the App Store
1. iPhone **screenshots** (App Store requires them per device size) — capture 4–6
   from TestFlight, or reuse the framing from the Play set.
2. Store listing — reuse the copy from `docs/play-store-listing.md` (description,
   privacy policy https://runsemble.net/privacy, data-safety answers, the
   background-location justification — App Review scrutinises this too).
3. Flip `submit_to_app_store: true` in `codemagic.yaml` (or submit from App Store
   Connect). Apple review is typically ~24–48h.

---

## Honest risk to watch
When the iOS platform was added, Capacitor warned:
`@capacitor-community/background-geolocation is built for Capacitor 7, it might
cause issues`. It works on Android, but **iOS is the more likely place this bites**.
If the Step-D walk test shows a gapped route on iPhone, the plugin's iOS build is
the first suspect — check for a newer plugin version or an alternative
(e.g. `@capgo/capacitor-background-geolocation`) before assuming the app is wrong.

## Cost summary
- Apple Developer: **$99/year** (hard requirement).
- Codemagic: **free** at pilot volume.
- No Mac purchase, no Xcode on your machine.
