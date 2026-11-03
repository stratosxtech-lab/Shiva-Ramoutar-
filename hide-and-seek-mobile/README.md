# Hide & Seek: iPhone and Android apps (Expo)

This is the store app for Hide & Seek. It opens the live web app (`../hide-and-seek-app`)
full screen and adds what a store app needs: an app icon and splash screen, location and
camera permissions, sound, the Android back button, and an offline screen.

The app loads the live site, so **every update you deploy to Vercel reaches app users
straight away**. You only need a new store build when you change the icon, name,
permissions or the web address.

| Setting | Value |
|---|---|
| App name | Hide & Seek |
| iOS bundle ID | `com.stratosxtech.hideandseek` |
| Android package | `com.stratosxtech.hideandseek` |
| Version | 1.0.0 (build numbers increase automatically) |
| Web address it opens | `extra.siteUrl` in `app.json` |
| Expo SDK | 58 |

## 1. One-time setup

You need a free [Expo account](https://expo.dev/signup), plus:
- **Apple Developer Program** ($99 a year) for the iPhone app
- **Google Play Console** ($25 once) for the Android app

No Mac, Xcode or Android Studio is needed. Expo builds both apps in the cloud.

```bash
cd hide-and-seek-mobile
npm install
npx eas-cli@latest login      # sign in with your Expo account
npx eas-cli@latest init       # links this folder to a new Expo project (adds its ID to app.json)
```

**Before your first store build**, change `extra.siteUrl` in `app.json` to the app's public
web address. Store apps can't open the site while it's private behind Vercel's login.

## 2. Build the files

| You want | Command | You get |
|---|---|---|
| An **APK** to install and test on Android phones | `npm run build:android:apk` | `.apk` download link |
| The **Google Play** file | `npm run build:android` | `.aab` app bundle |
| The **App Store** file | `npm run build:ios` | `.ipa` (Expo asks you to sign in to Apple once and handles certificates) |

Each command prints a link to the build on expo.dev, where you can download the file when
it finishes (usually 10 to 20 minutes).

## 3. Submit to the stores

```bash
npm run submit:ios        # uploads the latest iPhone build to App Store Connect
npm run submit:android    # uploads the latest Android build to Google Play
```

For Google Play, the first upload must be made by hand in Play Console, and later
uploads can use the command. Expo's submit guide explains how to add a Google service
account key so the command can upload for you.

Then complete each store listing using **`STORE-LISTING.md`** and the graphics in **`store/`**:
- `store/play-icon-512.png` is the Google Play icon (512 × 512)
- `store/play-feature-graphic-1024x500.png` is the Google Play feature graphic
- The iPhone app icon is taken from `assets/icon.png` automatically

You'll also need **screenshots** from a real phone. Take them while playing a game, for
example the lobby, the radar, the hider's QR code and the results podium.

## What's already handled

- **Permissions:** location "while using the app" and camera only. Background location,
  microphone, storage and "draw over other apps" are switched off, which avoids extra
  questions in store review.
- **Permission messages:** written in plain language (see `app.json`).
- **Encryption declaration:** set to "standard encryption only", so App Store Connect
  doesn't ask each time.
- **Payments on iPhone:** inside the iPhone app the Buy buttons are hidden and players are
  told plans are available on the website. This follows Apple's rule that digital
  purchases inside iPhone apps must use In-App Purchase. Plans bought on the website
  appear in the app when players sign in. Android and the website are unaffected.
- **Links to other sites** (such as card payment pages) open in the phone's browser.

## Store review tips

- **Apple's "minimum functionality" rule (4.2):** in the review notes, explain that the
  game uses location, the camera, sound and real-time multiplayer, and needs two phones to
  play. Give the reviewer a test access code from your owner console (`/admin`).
- **Demo account:** create a player account for the reviewer and include the email and
  password in the review notes.
- **Privacy policy URL:** both stores require one. Publish it on the website first.

## Changing the app later

- **Web address:** edit `extra.siteUrl` in `app.json`, then build and submit again.
- **Icon or splash:** replace the files in `assets/` (same names and sizes), then rebuild.
- **Code check:** `npm run typecheck`.
