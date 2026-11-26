package app.playo.games;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Keep the layout the same as on the website even when the phone's system font size is set larger:
    // otherwise Android scales all text in the app and letters spill out of game cells.
    if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().getSettings().setTextZoom(100);
  }
}
