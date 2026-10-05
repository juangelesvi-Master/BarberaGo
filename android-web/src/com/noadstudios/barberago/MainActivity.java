package com.noadstudios.barberago;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * BarberaGo para Android: abre la aplicación web publicada (https://barberago.restorago.com) dentro de la app.
 * Cada publicación de la web actualiza también la app, sin reinstalar el APK.
 * Los enlaces a otros sitios (Mercado Pago, WhatsApp, mapas) se abren en su app o en el navegador.
 */
public class MainActivity extends Activity {
    private static final String INICIO = "https://barberago.restorago.com/";
    private static final String HOST = "barberago.restorago.com";
    private static final int ELEGIR_ARCHIVO = 1;

    private WebView web;
    private ValueCallback<Uri[]> archivos;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F0E0C"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " BarberaGoAndroid/1.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            // API 24+ (no está en el android.jar 23 con el que se compila, pero Android la llama igual).
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return abrirFuera(req.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return abrirFuera(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame()) sinConexion();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (archivos != null) archivos.onReceiveValue(null);
                archivos = callback;
                try {
                    startActivityForResult(params.createIntent(), ELEGIR_ARCHIVO);
                } catch (ActivityNotFoundException e) {
                    archivos = null;
                    return false;
                }
                return true;
            }
        });

        if (guardado != null) web.restoreState(guardado);
        else web.loadUrl(destino(getIntent()));
    }

    /** Las páginas de BarberaGo se quedan en la app; lo demás se abre fuera. */
    private boolean abrirFuera(Uri uri) {
        String esquema = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        if ((esquema.equals("https") || esquema.equals("http")) && host.equals(HOST)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            // Sin app para abrirlo: se ignora.
        }
        return true;
    }

    private String destino(Intent intent) {
        Uri datos = intent == null ? null : intent.getData();
        if (datos != null && HOST.equals(datos.getHost())) return datos.toString();
        return INICIO;
    }

    private void sinConexion() {
        String html = "<html><body style=\"background:#0f0e0c;color:#f3ece0;font-family:sans-serif;display:flex;"
            + "align-items:center;justify-content:center;height:100vh;margin:0;text-align:center\"><div>"
            + "<div style=\"font-size:56px;color:#c9a45c;font-family:serif;font-style:italic\">B</div>"
            + "<h2 style=\"font-weight:500;letter-spacing:.1em\">SIN CONEXIÓN</h2>"
            + "<p style=\"color:#a89f91\">Revisa tu internet e inténtalo de nuevo.</p>"
            + "<a href=\"" + INICIO + "\" style=\"display:inline-block;margin-top:12px;padding:12px 28px;background:#c9a45c;"
            + "color:#16130f;text-decoration:none;border-radius:6px;letter-spacing:.1em\">REINTENTAR</a>"
            + "</div></body></html>";
        web.loadDataWithBaseURL(INICIO, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) web.loadUrl(destino(intent));
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        if (pedido == ELEGIR_ARCHIVO && archivos != null) {
            archivos.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, datos));
            archivos = null;
            return;
        }
        super.onActivityResult(pedido, resultado, datos);
    }

    @Override
    public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (tecla == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(tecla, evento);
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
