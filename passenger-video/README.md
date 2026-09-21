# Passenger Screen

A standalone Android video player for a **rear-seat or passenger display** — a
tablet or phone mounted where a passenger, not the driver, can see it.

## What it is not

It has no CarPlay or Android Auto integration of any kind: no
`automotive_app_desc` metadata, no car app service, no media browser exposed to a
head unit. It cannot render to, or appear on, a driver's display, and nothing in
it defeats a vehicle's video lockout. Mount the device out of the driver's line
of sight.

## Features

- Plays video already on the device (via MediaStore, with `READ_MEDIA_VIDEO`).
- Plays whole folders you grant through the storage-access framework — USB
  sticks and SD cards included. Access is persisted across reboots.
- Plays direct network URLs, including HLS and DASH streams.
- Remembers where you stopped and offers a resume point. Positions in the first
  10 seconds or within 15 seconds of the end are discarded, so a finished video
  does not resume at its tail.
- Fullscreen landscape playback with immersive system bars and keep-screen-on.
- Picture-in-picture when the passenger switches apps mid-video.
- Handles `VIEW` intents for `video/*`, so it can be the share/open target for
  video from other apps.

## Layout

```
passenger-video/
├── app/src/main/java/com/passengerscreen/video/
│   ├── PassengerScreenApp.kt        Application, owns the repository
│   ├── data/VideoItem.kt            Library entry model
│   ├── data/VideoRepository.kt      MediaStore + SAF scan, URLs, resume state
│   ├── ui/LibraryActivity.kt        Compose library screen
│   ├── ui/LibraryViewModel.kt       Library state
│   ├── ui/Theme.kt                  Material 3 colours
│   └── player/PlayerActivity.kt     Media3/ExoPlayer fullscreen playback
└── app/src/main/res/                Strings, theme, launcher icon
```

## Building

Requires JDK 17 and the Android SDK (compileSdk 35). minSdk is 24.

```bash
cd passenger-video
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

Install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`, or
sideload the APK on the tablet (Settings → allow installs from this source).

### Building without a local Android SDK

Push to any branch and the `Passenger Screen APK` GitHub Actions workflow builds
both variants and uploads them as a downloadable `passenger-screen-apk`
artifact.

## Signing

`assembleRelease` is currently wired to the **debug** signing config so CI can
produce an installable APK without secrets. Before distributing the app,
generate a real keystore and replace that `signingConfig` in
`app/build.gradle.kts`:

```bash
keytool -genkey -v -keystore release.keystore -alias passenger \
  -keyalg RSA -keysize 2048 -validity 10000
```

## Cleartext HTTP

`usesCleartextTraffic="true"` is enabled so plain-HTTP URLs from a local media
server work. If you only ever use HTTPS sources, drop that attribute from
`AndroidManifest.xml`.
