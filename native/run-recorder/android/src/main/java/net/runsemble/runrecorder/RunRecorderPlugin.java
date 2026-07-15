package net.runsemble.runrecorder;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

/**
 * RunRecorder — Capacitor Plugin (Phase 2).
 *
 * This is the JS↔native bridge. The heavy lifting lives in RunRecorderService
 * (a started foreground service). See docs/tracking-endgame-plan.md for the
 * full spec this implements.
 *
 * All methods are annotated @PluginMethod so Capacitor routes them here from JS.
 */
@CapacitorPlugin(name = "RunRecorder")
public class RunRecorderPlugin extends Plugin {

    private static final String TAG = "RunRecorderPlugin";

    // -----------------------------------------------------------------------
    // Public Capacitor methods
    // -----------------------------------------------------------------------

    @PluginMethod
    public void startTracking(PluginCall call) {
        String runId = call.getString("runId");
        if (runId == null || runId.isEmpty()) {
            call.reject("runId is required");
            return;
        }
        Intent intent = new Intent(getContext(), RunRecorderService.class);
        intent.setAction(RunRecorderService.ACTION_START_TRACKING);
        intent.putExtra(RunRecorderService.EXTRA_RUN_ID, runId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Intent intent = new Intent(getContext(), RunRecorderService.class);
        intent.setAction(RunRecorderService.ACTION_STOP_TRACKING);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getActiveSession(PluginCall call) {
        String runId = RunRecorderService.getCurrentRunId();
        long startedAt = RunRecorderService.getStartedAt();
        JSObject ret = new JSObject();
        ret.put("runId", runId != null ? runId : JSObject.NULL);
        if (runId != null) ret.put("startedAt", startedAt);
        call.resolve(ret);
    }

    @PluginMethod
    public void getTrack(PluginCall call) {
        String runId = call.getString("runId");
        int sinceIndex = call.getInt("sinceIndex", 0);
        if (runId == null || runId.isEmpty()) {
            call.reject("runId is required");
            return;
        }
        JSArray points = new JSArray();
        try {
            File trackFile = getTrackFile(runId);
            if (trackFile.exists()) {
                List<JSONObject> all = readAllPoints(trackFile);
                int start = Math.max(0, sinceIndex);
                for (int i = start; i < all.size(); i++) {
                    points.put(all.get(i));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "getTrack error", e);
        }
        JSObject ret = new JSObject();
        ret.put("points", points);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearTrack(PluginCall call) {
        String runId = call.getString("runId");
        if (runId != null) {
            File f = getTrackFile(runId);
            if (f.exists()) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
        call.resolve();
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private File getTrackFile(String runId) {
        File dir = new File(getContext().getFilesDir(), "runs");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return new File(dir, runId + ".jsonl");
    }

    private List<JSONObject> readAllPoints(File file) {
        List<JSONObject> result = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (!line.trim().isEmpty()) {
                    result.add(new JSONObject(line));
                }
            }
        } catch (Exception ignored) {}
        return result;
    }
}
