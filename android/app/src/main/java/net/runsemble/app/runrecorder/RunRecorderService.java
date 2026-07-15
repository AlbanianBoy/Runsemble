package net.runsemble.app.runrecorder;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.List;

/**
 * RunRecorderService — Phase 2 (see docs/tracking-endgame-plan.md §4).
 *
 * A *started*, sticky, foreground service that OWNS a run session and writes every
 * GPS fix straight to disk as it lands. This is the durability fix: a valid fix
 * becomes a durable, timestamped record on disk regardless of whether the WebView
 * is frozen, backgrounded, or the process is later killed. The JS layer becomes a
 * pure reader (getTrack / getActiveSession) instead of the source of truth.
 *
 * Provider strategy is the hard-won one from the patched plugin: FUSED is primary
 * (A-GPS assisted → fast + accurate ±4m); raw GPS_PROVIDER is a fallback that is
 * only brought in when fused STARVES (Samsung's background rate cap). We never run
 * both continuously — that starves the GPS hardware and makes fused emit ±600m
 * garbage.
 *
 * Storage layout (app-private filesDir):
 *   runs/{runId}.jsonl   append-only, one JSON object per fix: {t,lat,lng,acc,p}
 *   runs/active.json     pointer to the in-progress run: {runId,startedAt,updatedAt,count}
 */
public class RunRecorderService extends Service {

    public static final String ACTION_START = "net.runsemble.app.runrecorder.START";
    public static final String ACTION_STOP = "net.runsemble.app.runrecorder.STOP";
    public static final String EXTRA_RUN_ID = "runId";

    private static final int NOTIFICATION_ID = 41287;
    private static final String CHANNEL_ID = "runsemble_run_recorder";
    private static final long MAX_WAIT_MS = 5000;      // mild batching (hardware FIFO)
    private static final long STARVE_MS = 30000;       // fused silent this long → raw fallback
    private static final long RECOVER_MS = 15000;      // fused healthy again → drop raw

    // One process-wide lock guarding the run files (service writes, plugin reads).
    static final Object FILE_LOCK = new Object();

    private String runId = null;
    private volatile boolean tracking = false;

    private FusedLocationProviderClient fused;
    private LocationCallback fusedCallback;
    private LocationManager locationManager;
    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private Writer trackWriter;

    private long startedAt = 0L;
    private int count = 0;
    private long lastActiveWriteMs = 0L;

    // Provider arbitration (single active provider — never both delivering at once).
    private volatile String activeProvider = "fused";
    private volatile long lastFusedFixMs = 0L;
    private volatile boolean rawRegistered = false;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        thread = new HandlerThread("run-recorder");
        thread.start();
        handler = new Handler(thread.getLooper());
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        fused = LocationServices.getFusedLocationProviderClient(this);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        // START (or a sticky restart with a null intent — recover the active run).
        String id = intent != null ? intent.getStringExtra(EXTRA_RUN_ID) : null;
        if (id == null) {
            id = readActiveRunId(this); // sticky restart after a kill mid-run
        }
        if (id == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundSafely();
        if (!tracking || !id.equals(runId)) {
            startTracking(id);
        }
        // START_STICKY: if the OS kills us mid-run, it restarts the service (null
        // intent) and we resume the active run from disk.
        return START_STICKY;
    }

    // ─── Tracking lifecycle ──────────────────────────────────────────────────────
    private void startTracking(String id) {
        runId = id;
        tracking = true;
        activeProvider = "fused";
        long now = System.currentTimeMillis();
        lastFusedFixMs = now;
        count = countLines(trackFile(this, id)); // resume-safe (append to existing)
        openTrackWriter(id);
        if (startedAt == 0L) startedAt = readStartedAt(this, id, now);
        writeActive(id);
        acquireWakeLock();
        requestFused();
        startWatchdog();
    }

    private void stopTracking() {
        tracking = false;
        stopWatchdog();
        if (fused != null && fusedCallback != null) {
            try { fused.removeLocationUpdates(fusedCallback); } catch (Exception ignore) {}
        }
        removeRawUpdates();
        closeTrackWriter();
        clearActive(this);
        releaseWakeLock();
        runId = null;
        startedAt = 0L;
        count = 0;
    }

    @Override
    public void onDestroy() {
        stopTracking();
        if (thread != null) { thread.quitSafely(); thread = null; }
        super.onDestroy();
    }

    // ─── Location: fused primary ────────────────────────────────────────────────
    private void requestFused() {
        LocationRequest req = new LocationRequest();
        req.setInterval(1000);
        req.setFastestInterval(1000);
        req.setMaxWaitTime(MAX_WAIT_MS);
        req.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        req.setSmallestDisplacement(0);
        fusedCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                List<Location> locs = result.getLocations();
                if (locs == null || locs.isEmpty()) return;
                lastFusedFixMs = System.currentTimeMillis();
                if (!"fused".equals(activeProvider)) return; // raw owns delivery right now
                for (Location l : locs) record(l, "fused");
            }
            @Override
            public void onLocationAvailability(LocationAvailability a) {}
        };
        try {
            fused.requestLocationUpdates(req, fusedCallback, thread.getLooper());
        } catch (SecurityException ignore) {}
    }

    // ─── Location: raw GPS fallback (only while fused is starved) ────────────────
    private final LocationListener rawListener = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            if (l == null) return;
            if (!"gps".equals(activeProvider)) return;
            record(l, "gps");
        }
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
        @Override public void onStatusChanged(String p, int s, Bundle b) {}
    };

    private void ensureRawUpdates() {
        if (rawRegistered || locationManager == null) return;
        try {
            locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, 1000L, 0f, rawListener, thread.getLooper());
            rawRegistered = true;
        } catch (SecurityException ignore) {} catch (Exception ignore) {}
    }

    private void removeRawUpdates() {
        if (locationManager != null && rawRegistered) {
            try { locationManager.removeUpdates(rawListener); } catch (Exception ignore) {}
        }
        rawRegistered = false;
    }

    // ─── Watchdog: swap providers on starvation / recovery ──────────────────────
    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            try {
                if (tracking) {
                    long silent = System.currentTimeMillis() - lastFusedFixMs;
                    if ("fused".equals(activeProvider) && silent > STARVE_MS) {
                        ensureRawUpdates();
                        activeProvider = "gps";
                    } else if ("gps".equals(activeProvider) && silent < RECOVER_MS) {
                        activeProvider = "fused";
                        removeRawUpdates();
                    }
                }
            } catch (Exception ignore) {}
            if (tracking && handler != null) handler.postDelayed(this, 20000);
        }
    };
    private void startWatchdog() {
        if (handler == null) return;
        handler.removeCallbacks(watchdog);
        handler.postDelayed(watchdog, 20000);
    }
    private void stopWatchdog() {
        if (handler != null) handler.removeCallbacks(watchdog);
    }

    // ─── Persistence ────────────────────────────────────────────────────────────
    private void record(Location l, String provider) {
        long t = l.getTime() > 0 ? l.getTime() : System.currentTimeMillis();
        JSONObject o = new JSONObject();
        try {
            o.put("t", t);
            o.put("lat", l.getLatitude());
            o.put("lng", l.getLongitude());
            o.put("acc", l.hasAccuracy() ? l.getAccuracy() : JSONObject.NULL);
            o.put("p", provider);
        } catch (Exception ignore) { return; }
        synchronized (FILE_LOCK) {
            try {
                if (trackWriter != null) {
                    trackWriter.write(o.toString());
                    trackWriter.write("\n");
                    trackWriter.flush(); // durability: survive a crash right after this fix
                    count++;
                }
            } catch (Exception ignore) {}
        }
        long now = System.currentTimeMillis();
        if (now - lastActiveWriteMs > 5000) { // refresh the active pointer periodically
            lastActiveWriteMs = now;
            writeActive(runId);
        }
    }

    private void openTrackWriter(String id) {
        synchronized (FILE_LOCK) {
            try {
                File f = trackFile(this, id);
                File dir = f.getParentFile();
                if (dir != null && !dir.exists()) dir.mkdirs();
                trackWriter = new OutputStreamWriter(new FileOutputStream(f, true), "UTF-8");
            } catch (Exception ignore) { trackWriter = null; }
        }
    }
    private void closeTrackWriter() {
        synchronized (FILE_LOCK) {
            try { if (trackWriter != null) { trackWriter.flush(); trackWriter.close(); } } catch (Exception ignore) {}
            trackWriter = null;
        }
    }

    private void writeActive(String id) {
        if (id == null) return;
        JSONObject o = new JSONObject();
        try {
            o.put("runId", id);
            o.put("startedAt", startedAt);
            o.put("updatedAt", System.currentTimeMillis());
            o.put("count", count);
        } catch (Exception ignore) { return; }
        synchronized (FILE_LOCK) {
            try {
                File f = activeFile(this);
                File dir = f.getParentFile();
                if (dir != null && !dir.exists()) dir.mkdirs();
                FileOutputStream fos = new FileOutputStream(f, false);
                fos.write(o.toString().getBytes("UTF-8"));
                fos.close();
            } catch (Exception ignore) {}
        }
    }

    // ─── Static helpers (also used by the plugin, on its own thread) ────────────
    static File runsDir(Context ctx) { return new File(ctx.getFilesDir(), "runs"); }
    static File trackFile(Context ctx, String runId) { return new File(runsDir(ctx), runId + ".jsonl"); }
    static File activeFile(Context ctx) { return new File(runsDir(ctx), "active.json"); }

    static void clearActive(Context ctx) {
        synchronized (FILE_LOCK) {
            try { File f = activeFile(ctx); if (f.exists()) f.delete(); } catch (Exception ignore) {}
        }
    }

    static String readActiveRunId(Context ctx) {
        JSONObject o = readActive(ctx);
        return o != null ? o.optString("runId", null) : null;
    }

    static JSONObject readActive(Context ctx) {
        synchronized (FILE_LOCK) {
            try {
                File f = activeFile(ctx);
                if (!f.exists()) return null;
                return new JSONObject(readFile(f));
            } catch (Exception e) { return null; }
        }
    }

    private static long readStartedAt(Context ctx, String id, long fallback) {
        JSONObject o = readActive(ctx);
        if (o != null && id.equals(o.optString("runId", null))) {
            long s = o.optLong("startedAt", 0L);
            if (s > 0) return s;
        }
        return fallback;
    }

    private static int countLines(File f) {
        synchronized (FILE_LOCK) {
            if (f == null || !f.exists()) return 0;
            try {
                String s = readFile(f);
                if (s.isEmpty()) return 0;
                int n = 0;
                for (int i = 0; i < s.length(); i++) if (s.charAt(i) == '\n') n++;
                return n;
            } catch (Exception e) { return 0; }
        }
    }

    // Read the persisted track from a starting line index (for incremental JS polling).
    // Returns a JSON array of {t,lat,lng,acc,p} objects.
    static org.json.JSONArray readTrack(Context ctx, String runId, int sinceIndex) {
        org.json.JSONArray arr = new org.json.JSONArray();
        synchronized (FILE_LOCK) {
            try {
                File f = trackFile(ctx, runId);
                if (!f.exists()) return arr;
                String s = readFile(f);
                if (s.isEmpty()) return arr;
                String[] lines = s.split("\n");
                for (int i = Math.max(0, sinceIndex); i < lines.length; i++) {
                    String line = lines[i];
                    if (line == null || line.trim().isEmpty()) continue;
                    try { arr.put(new org.json.JSONObject(line)); } catch (Exception ignore) {}
                }
            } catch (Exception ignore) {}
        }
        return arr;
    }

    private static String readFile(File f) throws Exception {
        FileInputStream fis = new FileInputStream(f);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = fis.read(buf)) != -1) bos.write(buf, 0, n);
        fis.close();
        return bos.toString("UTF-8");
    }

    // ─── Foreground service plumbing ────────────────────────────────────────────
    private void startForegroundSafely() {
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception ignore) {}
    }

    private Notification buildNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = null;
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            pi = PendingIntent.getActivity(this, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle("Runsemble is tracking your run")
                .setContentText("Tap to return to your run.")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setWhen(System.currentTimeMillis());
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager m = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel c = new NotificationChannel(CHANNEL_ID, "Run tracking",
                    NotificationManager.IMPORTANCE_LOW);
            c.setSound(null, null);
            c.enableVibration(false);
            if (m != null) m.createNotificationChannel(c);
        }
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "runsemble:run-recorder");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(6 * 60 * 60 * 1000L /* 6h */);
    }
    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }
}
