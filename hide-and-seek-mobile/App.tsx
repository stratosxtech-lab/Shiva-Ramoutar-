import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { WebView as RNWebView, type WebViewNavigation } from "react-native-webview";
import type { WebViewProps } from "react-native-webview/lib/WebView";

// The library types WebView as a function component, which React 19's types won't accept a ref on.
// It is a forwardRef component at runtime, so describe it that way.
type WebViewHandle = { goBack: () => void; reload: () => void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & React.RefAttributes<WebViewHandle>>;

/** The live Hide & Seek web app. Change it in app.json under extra.siteUrl when you move to your own domain. */
const SITE_URL: string = (Constants.expoConfig?.extra?.siteUrl as string) ?? "https://hide-and-seek-gilt.vercel.app";
const SITE_HOST = new URL(SITE_URL).host;
const COLORS = { dusk: "#121C26", mist: "#E8EEF0", fog: "#9DB0BA", lantern: "#F4B740" };

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const web = useRef<WebViewHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  // Ask for location once at launch so the game can start straight away. The web app explains why it's needed.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  // Android back button goes back inside the app before leaving it.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Keep the app on Hide & Seek pages. Other links (for example card payment pages) open in the phone's browser.
  const onShouldStart = useCallback((req: { url: string }) => {
    try {
      const u = new URL(req.url);
      if (u.protocol === "about:" || u.protocol === "blob:" || u.protocol === "data:") return true;
      if (u.host === SITE_HOST) return true;
      Linking.openURL(req.url).catch(() => {});
      return false;
    } catch {
      return true;
    }
  }, []);

  const retry = () => { setOffline(false); setLoading(true); setKey((k) => k + 1); };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        {offline ? (
          <View style={styles.center}>
            <Text style={styles.brand}>Hide <Text style={{ color: COLORS.lantern }}>&amp;</Text> Seek</Text>
            <Text style={styles.body}>You're offline. Hide &amp; Seek needs a connection to keep everyone's game in sync.</Text>
            <Pressable onPress={retry} style={styles.button} accessibilityRole="button">
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={key}
            ref={web}
            source={{ uri: SITE_URL }}
            style={styles.web}
            originWhitelist={["*"]}
            applicationNameForUserAgent={`HideAndSeekApp/${Constants.expoConfig?.version ?? "1.0.0"} (${Platform.OS})`}
            geolocationEnabled
            mediaCapturePermissionGrantType="grant"
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            sharedCookiesEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            pullToRefreshEnabled={false}
            decelerationRate="normal"
            onShouldStartLoadWithRequest={onShouldStart}
            onNavigationStateChange={(n: WebViewNavigation) => setCanGoBack(n.canGoBack)}
            onLoadEnd={() => { setLoading(false); SplashScreen.hideAsync().catch(() => {}); }}
            onError={() => { setOffline(true); SplashScreen.hideAsync().catch(() => {}); }}
            onContentProcessDidTerminate={() => web.current?.reload()}
            onRenderProcessGone={() => setKey((k) => k + 1)}
          />
        )}
        {loading && !offline && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={COLORS.lantern} />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.dusk },
  web: { flex: 1, backgroundColor: COLORS.dusk },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  brand: { color: COLORS.mist, fontSize: 30, fontWeight: "800" },
  body: { color: COLORS.fog, fontSize: 16, textAlign: "center", maxWidth: 300, lineHeight: 22 },
  button: { backgroundColor: COLORS.lantern, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: "#2A1C00", fontWeight: "700", fontSize: 15 },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.dusk },
});
