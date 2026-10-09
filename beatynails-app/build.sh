#!/bin/sh
# Compila la app del panel sin Android Studio. Necesita (Ubuntu):
#   apt-get install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange
# y una llave de firma: KEYSTORE=/ruta/llave.jks KEYPASS=... (la misma siempre, o Android no deja actualizar).
set -e
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
JAR=$SDK/platforms/android-23/android.jar
OUT=${OUT:-../beatynails/descargas/beatynails-panel.apk}
: "${KEYSTORE:?Falta KEYSTORE}" "${KEYPASS:?Falta KEYPASS}"
rm -rf build && mkdir -p build/gen build/classes
aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$JAR" -F build/app.unaligned.apk
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -bootclasspath "$JAR" -d build/classes $(find src build/gen -name '*.java')
dalvik-exchange --dex --min-sdk-version=23 --output=build/classes.dex build/classes
(cd build && aapt add app.unaligned.apk classes.dex >/dev/null)
zipalign -f -p 4 build/app.unaligned.apk build/app.aligned.apk
mkdir -p "$(dirname "$OUT")"
apksigner sign --v4-signing-enabled false --ks "$KEYSTORE" --ks-pass env:KEYPASS --key-pass env:KEYPASS --out "$OUT" build/app.aligned.apk
apksigner verify --print-certs "$OUT" | head -3
ls -l "$OUT"
