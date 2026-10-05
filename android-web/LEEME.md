# BarberaGo para Android

App ligera (WebView) que abre https://barberago.restorago.com. Cada publicación de la web actualiza la app.
El APK publicado vive en `public/descargas/BarberaGo.apk` y se descarga desde la web en `/descargas/BarberaGo.apk`.

Compilar (Ubuntu/Debian, sin Android Studio):

    sudo apt install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
    ./android-web/compilar.sh && cp android-web/build/BarberaGo.apk public/descargas/

Se firma con `android/app/barberago-debug.keystore` para que cada APK nuevo se instale encima del anterior.
Sube `versionCode` en `AndroidManifest.xml` en cada versión nueva. Para Google Play usa el proyecto `android/` (Capacitor) con una llave propia.
