#!/bin/sh
# Compila BarberaGo.apk sin Android Studio (Ubuntu: apt install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23).
set -e
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
JAR=$SDK/platforms/android-23/android.jar
rm -rf build && mkdir -p build/gen build/obj build/apk
aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$JAR" --min-sdk-version 24 --target-sdk-version 34
javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath "$JAR" -d build/obj build/gen/com/noadstudios/barberago/R.java src/com/noadstudios/barberago/*.java
dalvik-exchange --dex --min-sdk-version=24 --output=build/apk/classes.dex build/obj
aapt package -f -M AndroidManifest.xml -S res -I "$JAR" --min-sdk-version 24 --target-sdk-version 34 -F build/sin-firma.apk build/apk
zipalign -f -p 4 build/sin-firma.apk build/alineado.apk
apksigner sign --ks ../android/app/barberago-debug.keystore --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --out build/BarberaGo.apk build/alineado.apk
apksigner verify --print-certs build/BarberaGo.apk | head -2
ls -l build/BarberaGo.apk
