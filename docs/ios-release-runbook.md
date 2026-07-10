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
Background GPS uses **`@capgo/background-geolocation`** — free (MPL-2.0), built
for **Capacitor 8**, and the maintained, purpose-built plugin for exactly this
(fitness/run tracking). That removed the old "built for Capacitor 7" warning.

Still: **iOS background rules are stricter than Android, so treat iPhone tracking
as unproven until the Step-D walk test passes.** If the route comes back gapped
on iPhone, work the fixes in this order before suspecting anything deeper:
1. Confirm location is set to **"Always"** (not "While Using").
2. Make the run **timer clock-based** (compute elapsed from timestamps) so a
   WebView frozen while backgrounded catches up correctly on resume — the one
   change we didn't need on Android but iOS may require.
3. Only then consider a heavier option. A full native rewrite is a last resort,
   not a first move.

## Cost summary
- Apple Developer: **$99/year** (hard requirement).
- Codemagic: **free** at pilot volume.
- No Mac purchase, no Xcode on your machine.
