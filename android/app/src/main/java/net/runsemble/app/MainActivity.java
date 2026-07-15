package net.runsemble.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import net.runsemble.app.runrecorder.RunRecorderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Phase 2: our native disk-first run recorder (must register before super).
        registerPlugin(RunRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
