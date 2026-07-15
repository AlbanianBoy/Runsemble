package net.runsemble.runrecorder;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * RunRecorderService — Phase 2 heart.
 *
 * A started foreground service (START_STICKY). Owns the run by runId.
 * Every accepted GPS fix is appended immediately to:
 *   filesDir/runs/<runId>.jsonl
 *
 * Design decisions (from tracking-endgame-plan.md):
 * - FOREGROUND_SERVICE_TYPE_LOCATION (API 29+)
 * - Dedicated HandlerThread for all location callbacks
 * - FusedLocationProvider primary + raw GNSS watchdog fallback (proven on Samsung A51)
 * - PARTIAL_WAKE_LOCK held only while a run is active
 * - Static fields for getActiveSession() without needing to bind
 */
public class RunRecorderService extends Service {

    private static final String TAG = "RunRecorderService";

    public static final String ACTION_START_TRACKING = "net.runsemble.runrecorder.START";
    public static final String ACTION_STOP_TRACKING  = "net.runsemble.runrecorder.STOP";
    public static final String EXTRA_RUN_ID          = "runId";

    private static final int    NOTIFICATION_ID = 424242;
    private static final String CHANNEL_ID      = "runsemble_run_tracking";

    // Watchdog: if fused delivers nothing for this many ms, escalate to raw GNSS
    private static final long WATCHDOG_STARVATION_MS = 30_000L;

    // Static so getActiveSession() works without binding
    private static volatile String sCurrentRunId = null;
    private static volatile long   sStartedAt    = 0L;

    private final IBinder binder = new LocalBinder();

    private FusedLocationProviderClient fusedClient;
    private LocationCallback            fusedCallback;
    private LocationManager             locationManager;
    private LocationListener            rawListener;
    private HandlerThread               locationThread;
    private Handler                     locationHandler;
    private PowerManager.WakeLock       wakeLock;

    private long lastFusedFixTime = 0L;
    private boolean rawGnssActive = false;

    // -----------------------------------------------------------------------
    // Service lifecycle
    // -----------------------------------------------------------------------

    public class LocalBinder extends Binder {
        RunRecorderService getService() { return RunRecorderService.this; }
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        locationThread = new HandlerThread("RunRecorder-Location");
        locationThread.start();
        locationHandler = new Handler(locationThread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction();
        String runId  = intent.getStringExtra(EXTRA_RUN_ID);
        if (ACTION_START_TRACKING.equals(action) && runId != null) {
            startTrackingInternal(runId);
        } else if (ACTION_STOP_TRACKING.equals(action)) {
            stopTrackingInternal();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        releaseWakeLock();
        if (locationThread != null) locationThread.quitSafely();
        super.onDestroy();
    }

    // -----------------------------------------------------------------------
    // Run lifecycle
    // -----------------------------------------------------------------------

    private void startTrackingInternal(String runId) {
        if (runId.equals(sCurrentRunId)) return; // already tracking this run
        sCurrentRunId = runId;
        sStartedAt    = System.currentTimeMillis();
        rawGnssActive = false;
        lastFusedFixTime = 0L;

        // Ensure the runs directory exists
        File runsDir = new File(getFilesDir(), "runs");
        if (!runsDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            runsDir.mkdirs();
        }

        acquireWakeLock();
        startForegroundWithNotification("Recording run…");
        startLocationUpdates();
        Log.d(TAG, "Started tracking runId=" + runId);
    }

    private void stopTrackingInternal() {
        stopLocationUpdates();
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
        sCurrentRunId = null;
        Log.d(TAG, "Stopped tracking");
    }

    // -----------------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------------

    private void startLocationUpdates() {
        // --- Fused (primary) ---
        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, 1_000L)
                .setMinUpdateIntervalMillis(1_000L)
                .setMaxUpdateDelayMillis(5_000L)
                .setMinUpdateDistanceMeters(0f)
                .build();

        fusedCallback = new LocationCallback() {
            @Override public void onLocationResult(@NonNull LocationResult result) {
                for (Location loc : result.getLocations()) {
                    lastFusedFixTime = System.currentTimeMillis();
                    handleFix(loc, "fused");
                }
            }
        };

        try {
            fusedClient.requestLocationUpdates(request, fusedCallback, locationHandler.getLooper());
        } catch (SecurityException se) {
            Log.e(TAG, "Missing location permission (fused)", se);
        }

        // --- Raw GNSS watchdog (fallback — proven on Samsung A51) ---
        // Registers immediately. handleFix() deduplicates by timestamp.
        // If fused starves for WATCHDOG_STARVATION_MS we rely on this path.
        startRawGnss();
    }

    private void startRawGnss() {
        if (rawGnssActive) return;
        rawGnssActive = true;
        rawListener = new LocationListener() {
            @Override public void onLocationChanged(@NonNull Location location) {
                // Only promote raw GNSS if fused has been silent for the watchdog window
                long now = System.currentTimeMillis();
                boolean fusedSilent = lastFusedFixTime == 0
                        || (now - lastFusedFixTime) > WATCHDOG_STARVATION_MS;
                if (fusedSilent) {
                    handleFix(location, "gps");
                }
            }
            @Override public void onStatusChanged(String p, int s, Bundle e) {}
            @Override public void onProviderEnabled(@NonNull String p) {}
            @Override public void onProviderDisabled(@NonNull String p) {}
        };
        try {
            locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    1_000L, 0f, rawListener, locationHandler.getLooper());
        } catch (SecurityException ignored) {}
    }

    private void stopLocationUpdates() {
        if (fusedCallback != null && fusedClient != null) {
            fusedClient.removeLocationUpdates(fusedCallback);
            fusedCallback = null;
        }
        if (rawListener != null && locationManager != null) {
            locationManager.removeUpdates(rawListener);
            rawListener = null;
            rawGnssActive = false;
        }
    }

    private void handleFix(Location loc, String provider) {
        if (sCurrentRunId == null) return;
        long now = (loc.getTime() > 0) ? loc.getTime() : System.currentTimeMillis();

        JSONObject point = new JSONObject();
        try {
            point.put("t",   now);
            point.put("lat", loc.getLatitude());
            point.put("lng", loc.getLongitude());
            if (loc.hasAccuracy()) point.put("acc", (double) loc.getAccuracy());
            point.put("provider", provider);
        } catch (Exception ignored) {}

        appendToJsonl(point);
        updateNotification();
    }

    private void appendToJsonl(JSONObject point) {
        if (sCurrentRunId == null) return;
        File file = new File(new File(getFilesDir(), "runs"), sCurrentRunId + ".jsonl");
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file, true))) {
            writer.write(point.toString());
            writer.newLine();
            writer.flush();
        } catch (IOException e) {
            Log.e(TAG, "Failed to append point", e);
        }
    }

    // -----------------------------------------------------------------------
    // Wake lock
    // -----------------------------------------------------------------------

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "runsemble:run-recorder");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(TimeUnit.HOURS.toMillis(6)); // safety timeout
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    // -----------------------------------------------------------------------
    // Notification
    // -----------------------------------------------------------------------

    private void startForegroundWithNotification(String text) {
        Notification n = buildNotification(text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, n,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void updateNotification() {
        if (sStartedAt == 0) return;
        long elapsedSec = (System.currentTimeMillis() - sStartedAt) / 1000L;
        long mins = elapsedSec / 60;
        long secs = elapsedSec % 60;
        String text = String.format(Locale.US, "Running — %d:%02d", mins, secs);
        Notification n = buildNotification(text);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, n);
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent();
        intent.setClassName(this, "net.runsemble.app.MainActivity");
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Runsemble")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Run Tracking", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shows while a run is being recorded in the background");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // -----------------------------------------------------------------------
    // Static accessors (used by RunRecorderPlugin without binding)
    // -----------------------------------------------------------------------

    public static String getCurrentRunId() { return sCurrentRunId; }
    public static long   getStartedAt()    { return sStartedAt; }
}
