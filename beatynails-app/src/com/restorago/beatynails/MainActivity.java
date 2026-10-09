package com.restorago.beatynails;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** BeatyNails: abre la página del salón (y desde ahí el panel) dentro de la app. */
public class MainActivity extends Activity {
    static final String HOST = "beautynails.restorago.com";
    static final String START = "https://" + HOST + "/index.html";

    WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " BeatyNailsApp/1.1");

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation") // en Android 7+ también se llama esta versión
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return open(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) offline(view);
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String desc, String url) {
                offline(view);
            }
        });
        // Descargas (por ejemplo, la misma APK) se abren con el navegador del teléfono
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                external(Uri.parse(url));
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(START);
    }

    /** Las páginas del salón se quedan en la app; WhatsApp, pagos y lo demás se abren afuera. */
    boolean open(Uri uri) {
        String scheme = uri.getScheme();
        if (("https".equals(scheme) || "http".equals(scheme)) && HOST.equals(uri.getHost())) {
            String path = uri.getPath() == null ? "" : uri.getPath();
            if (!path.endsWith(".apk")) return false;
        }
        external(uri);
        return true;
    }

    void external(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            // No hay app para abrirlo
        }
    }

    void offline(WebView view) {
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px;text-align:center;color:#2a1520;background:#f7f2f4'>"
            + "<div><h2 style='font-weight:600'>Sin conexión</h2><p style='color:#7a6470'>Revisa el internet del teléfono y vuelve a intentar.</p>"
            + "<button onclick=\"location.href='" + START + "'\" style='border:0;border-radius:999px;padding:14px 26px;background:#8c1d40;color:#fff;font-size:16px'>Intentar de nuevo</button></div></body>";
        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
