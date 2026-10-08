package com.cansuites.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

/**
 * CanSuites para Android: abre el sitio en pantalla completa. Todo el contenido vive en el sitio,
 * así que la app se actualiza sola cada vez que se publica el sitio.
 */
public class MainActivity extends Activity {

    private static final int ELEGIR_ARCHIVO = 1;
    /** Páginas que se quedan dentro de la app (el sitio, el inicio de sesión y el cobro de Mercado Pago). */
    private static final String[] DOMINIOS_INTERNOS = {
        "mercadopago.com", "mercadopago.com.mx", "mercadolibre.com", "mercadolibre.com.mx", "mercadolivre.com", "supabase.co",
    };

    private WebView web;
    private ProgressBar barra;
    private ValueCallback<Uri[]> archivosPendientes;
    private String host;
    private String ultimaUrl;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        host = Uri.parse(BuildConfig.SITIO_URL).getHost();

        FrameLayout raiz = new FrameLayout(this);
        web = new WebView(this);
        barra = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        barra.setIndeterminate(false);
        barra.setMax(100);
        raiz.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        raiz.addView(barra, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 8));
        setContentView(raiz);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " CanSuitesApp/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Puente(), "CanSuites");
        web.setWebViewClient(new Cliente());
        web.setWebChromeClient(new Cromo());

        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl(urlInicial(getIntent()));
    }

    /** Si la app se abre desde un enlace del sitio, va a esa página; si no, a la portada. */
    private String urlInicial(Intent intent) {
        Uri dato = intent != null ? intent.getData() : null;
        if (dato != null && host.equals(dato.getHost())) return dato.toString();
        return BuildConfig.SITIO_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) web.loadUrl(urlInicial(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private boolean esInterna(Uri uri) {
        String h = uri.getHost();
        if (h == null) return false;
        if (h.equals(host) || h.endsWith("." + host)) return true;
        for (String d : DOMINIOS_INTERNOS) if (h.equals(d) || h.endsWith("." + d)) return true;
        return false;
    }

    /** WhatsApp, teléfono, correo, mapas y cualquier otro sitio se abren en su propia app. */
    private void abrirFuera(Uri uri) {
        try {
            Intent i;
            if ("intent".equals(uri.getScheme())) {
                i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
            } else {
                i = new Intent(Intent.ACTION_VIEW, uri);
            }
            startActivity(i);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            // No hay app para abrirlo: se ignora.
        }
    }

    private class Cliente extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri uri = req.getUrl();
            String esquema = uri.getScheme();
            if (("https".equals(esquema) || "http".equals(esquema)) && esInterna(uri)) return false;
            abrirFuera(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, Bitmap icono) {
            barra.setVisibility(View.VISIBLE);
            if (url.startsWith("http")) ultimaUrl = url;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            barra.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError error) {
            if (req.isForMainFrame()) v.loadUrl("file:///android_asset/sin-conexion.html");
        }
    }

    private class Cromo extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int progreso) {
            barra.setProgress(progreso);
        }

        /** Subir fotos (mascotas, productos) desde la galería o la cámara. */
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (archivosPendientes != null) archivosPendientes.onReceiveValue(null);
            archivosPendientes = callback;
            try {
                startActivityForResult(params.createIntent(), ELEGIR_ARCHIVO);
            } catch (ActivityNotFoundException e) {
                archivosPendientes = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int codigo, int resultado, Intent datos) {
        if (codigo == ELEGIR_ARCHIVO && archivosPendientes != null) {
            archivosPendientes.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, datos));
            archivosPendientes = null;
            return;
        }
        super.onActivityResult(codigo, resultado, datos);
    }

    /** Lo usa la página «sin conexión» para volver a intentar. */
    private class Puente {
        @JavascriptInterface
        public void reintentar() {
            runOnUiThread(() -> web.loadUrl(ultimaUrl != null ? ultimaUrl : BuildConfig.SITIO_URL));
        }
    }
}
