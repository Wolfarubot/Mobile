package com.wolfarubot.pockethunter;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Let the game's music and sounds start at launch instead of waiting for the first touch.
    getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
  }
}
