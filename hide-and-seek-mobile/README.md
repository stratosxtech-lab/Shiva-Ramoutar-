# Hide & Seek: iPhone and Android apps

These store apps wrap the live Hide & Seek web app (`hide-and-seek-app/`) using
[Capacitor](https://capacitorjs.com). Because the apps load the live site, every update
you deploy to Vercel reaches app users straight away. You only resubmit to the stores
when you change the icon, name or permissions.

## Before you start

| You need | Cost | Why |
|---|---|---|
| Apple Developer Program account | $99 a year | To publish on the App Store |
| Google Play Console account | $25 once | To publish on Google Play |
| A Mac with Xcode | — | Apple only allows iPhone builds on a Mac |
| Android Studio (Mac, Windows or Linux) | Free | To build the Android app |
| A public web address for the app | — | The apps load it, so it can't be behind Vercel's login |
| A privacy policy page | — | Both stores require one because the app uses location and the camera |

When the app moves to its own domain, change `server.url` in `capacitor.config.json`.

## One-time setup

```bash
cd hide-and-seek-mobile
npm install
npm run add:ios        # creates the ios/ project (Mac only)
npm run add:android    # creates the android/ project
```

### Permissions to add

The game uses location (play zone, warm zone, tag range) and the camera (QR tagging).

**iPhone:** in `ios/App/App/Info.plist` add:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Hide &amp; Seek uses your location during a game to keep you in the play zone and to show seekers a warm zone. It is never shown to other players.</string>
<key>NSCameraUsageDescription</key>
<string>Hide &amp; Seek uses the camera to scan a hider's QR code when you find them.</string>
```

**Android:** in `android/app/src/main/AndroidManifest.xml` add:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
```

### App icon

Use `www/icon.png` (512 × 512) as the source. In Xcode, add it to the AppIcon set.
In Android Studio, use **New → Image Asset**.

## Build and submit

1. `npm run sync`
2. **iPhone:** `npm run open:ios`, choose your team under Signing, then
   **Product → Archive → Distribute App → App Store Connect**.
3. **Android:** `npm run open:android`, then **Build → Generate Signed App Bundle**
   and upload the `.aab` file in Play Console.
4. Complete each store listing using `STORE-LISTING.md`.

## Store review notes

- **Apple guideline 4.2 (minimum functionality):** apps that only show a website can be
  rejected. Hide & Seek uses location, the camera, sound and real-time multiplayer, which
  helps. In the review notes, explain that a game needs two phones, and give the reviewer a
  test access code from the owner console.
- **Payments:** Apple requires In-App Purchase for digital content bought inside an iPhone
  app. The simplest path is to hide the Buy buttons inside the iPhone app and sell plans on
  the website, which Apple allows. Corporate plans sold by invoice are not affected.
- **Children:** if you market to under-13s, both stores apply extra privacy rules (COPPA in
  the US). Have the privacy policy reviewed before you submit.
