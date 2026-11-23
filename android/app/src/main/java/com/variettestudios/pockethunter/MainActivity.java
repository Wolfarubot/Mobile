package com.variettestudios.pockethunter;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Let the game's music and sounds start at launch instead of waiting for the first touch.
    getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    hideSystemBars();
  }

  /**
   * Full screen, like the web version added to the Home screen: the status bar and the navigation bar are hidden.
   * A swipe in from the edge shows them for a moment over the game, and they hide again by themselves. With them
   * hidden, Android reports no room taken at the bottom, so the game's bottom buffer (--safe-bottom) is 0.
   */
  private void hideSystemBars() {
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    // Back from another app, the notification shade or a system dialog: hidden again.
    if (hasFocus) hideSystemBars();
  }
}
