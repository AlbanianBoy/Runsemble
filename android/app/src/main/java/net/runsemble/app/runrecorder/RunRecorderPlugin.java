package net.runsemble.app.runrecorder;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONObject;

/**
 * RunRecorder — Phase 2 Capacitor plugin.
 *
 * Thin control surface over {@link RunRecorderService}. The service owns the run
 * and the disk; JS just starts/stops it and reads the durable track. Registered in
 * MainActivity (it lives in the app module, not a separate package).
 */
@CapacitorPlugin(
        name = "RunRecorder",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION
                }),
                // Android requires a *separate* runtime request for background location
                // (ACCESS_BACKGROUND_LOCATION). Without it the OS only offers
                // "While using the app" — which stops GPS the moment the screen turns off.
                // This alias is requested explicitly from JS via
                // run-recorder.ts#requestBackgroundLocation() before each recording starts.
                @Permission(alias = "backgroundLocation", strings = {
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                })
        }
)
public class RunRecorderPlugin extends Plugin {

    // Whether this native build actually has the RunRecorder (JS ships via web ahead
    // of native rebuilds, so the JS probes this before switching off the old path).
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        String runId = call.getString("runId");
        if (runId == null || runId.isEmpty()) {
            call.reject("runId required");
            return;
        }
        // R-0FF70: validate runId contains only safe alphanumeric/dash/underscore chars
        // to prevent path traversal attacks (runId is used to construct a file path).
        if (!runId.matches("^[a-zA-Z0-9_\\-]{1,128}$")) {
            call.reject("invalid runId");
            return;
        }
        Intent i = new Intent(getContext(), RunRecorderService.class);
        i.setAction(RunRecorderService.ACTION_START);
        i.putExtra(RunRecorderService.EXTRA_RUN_ID, runId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(i);
        } else {
            getContext().startService(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Intent i = new Intent(getContext(), RunRecorderService.class);
        i.setAction(RunRecorderService.ACTION_STOP);
        try { getContext().startService(i); } catch (Exception ignore) {}
        call.resolve();
    }

    // The in-progress run, if any — used on cold launch to reattach after an
    // app/WebView death mid-run.
    @PluginMethod
    public void getActiveSession(PluginCall call) {
        JSObject ret = new JSObject();
        JSONObject active = RunRecorderService.readActive(getContext());
        if (active == null || active.optString("runId", null) == null) {
            ret.put("active", false);
        } else {
            ret.put("active",     true);
            ret.put("runId",      active.optString("runId"));
            ret.put("startedAt",  active.optLong("startedAt", 0L));
            ret.put("updatedAt",  active.optLong("updatedAt", 0L));
            ret.put("count",      active.optInt("count", 0));
        }
        call.resolve(ret);
    }

    // Durable track from a line index onward (incremental polling from JS).
    @PluginMethod
    public void getTrack(PluginCall call) {
        String runId = call.getString("runId");
        if (runId == null || runId.isEmpty()) {
            call.reject("runId required");
            return;
        }
        // R-0FF70: same path-traversal guard as startTracking
        if (!runId.matches("^[a-zA-Z0-9_\\-]{1,128}$")) {
            call.reject("invalid runId");
            return;
        }
        int sinceIndex = call.getInt("sinceIndex", 0);
        JSArray points = new JSArray();
        org.json.JSONArray arr = RunRecorderService.readTrack(getContext(), runId, sinceIndex);
        for (int i = 0; i < arr.length(); i++) {
            points.put(arr.optJSONObject(i));
        }
        JSObject ret = new JSObject();
        ret.put("points",    points);
        ret.put("nextIndex", sinceIndex + arr.length());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearTrack(PluginCall call) {
        String runId = call.getString("runId");
        if (runId != null && !runId.isEmpty()) {
            // R-0FF70: path-traversal guard before using runId as a filename
            if (!runId.matches("^[a-zA-Z0-9_\\-]{1,128}$")) {
                call.reject("invalid runId");
                return;
            }
            try {
                java.io.File f = RunRecorderService.trackFile(getContext(), runId);
                synchronized (RunRecorderService.FILE_LOCK) {
                    if (f.exists()) f.delete();
                }
            } catch (Exception ignore) {}
        }
        RunRecorderService.clearActive(getContext());
        call.resolve();
    }

    // -------------------------------------------------------------------------
    // Battery optimisation helpers
    //
    // These are the methods that geo-watch.ts calls to check / request the Doze
    // whitelist. Previously they were cast onto BackgroundGeolocation (which does
    // not expose them), so they silently threw and the 'Allow background' button
    // in the permission nudge card was a no-op. Wired here so JS calls the right
    // plugin.
    // -------------------------------------------------------------------------

    /** Returns { ignoring: true } if the app is already on the Doze whitelist. */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            ret.put("ignoring", ignoring);
        } else {
            // Pre-M: no Doze, always effectively whitelisted.
            ret.put("ignoring", true);
        }
        call.resolve(ret);
    }

    /**
     * Fire the system dialog asking the user to exempt Runsemble from battery
     * optimisation (Doze whitelist). This is the AOSP equivalent of Samsung's
     * "Unrestricted" toggle and is the only reliable way to keep GPS alive with
     * the screen off across all OEMs.
     *
     * Uses ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS which targets this package
     * directly, so the user sees a single-tap "Allow" dialog rather than having
     * to navigate through the full battery settings list.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(
                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    android.net.Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                // Device blocked the direct intent (some OEMs) — fall back to the
                // full battery optimisation list so the user can find the app there.
                try {
                    Intent fallback = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                } catch (Exception ignore) {}
            }
        }
        // Resolve immediately — the dialog is async, the JS caller doesn't need to await.
        call.resolve();
    }
}
