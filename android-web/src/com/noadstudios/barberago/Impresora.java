package com.noadstudios.barberago;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Puente que la web de BarberaGo usa como window.BarberaGoNativo para imprimir tickets:
 *  - imprimirRed: manda los bytes ESC/POS directo a una impresora térmica de red (puerto 9100), sin apps extra.
 *  - imprimirHtml: abre la impresión de Android con el ticket (Mopria o el complemento de la marca).
 * La vista web de Android ignora window.print(), por eso hace falta este puente.
 */
public class Impresora {
    private final Activity actividad;
    private WebView vistaImpresion; // se conserva hasta que termina la impresión

    public Impresora(Activity actividad) {
        this.actividad = actividad;
    }

    @JavascriptInterface
    public String version() {
        return "1.1";
    }

    /** Devuelve "" si se imprimió, o el error en español. Corre en el hilo del puente, no en el de la pantalla. */
    @JavascriptInterface
    public String imprimirRed(String ip, int puerto, String base64) {
        if (ip == null || !ip.matches("^[0-9A-Za-z.\\-]{3,64}$")) return "La dirección de la impresora no es válida";
        if (puerto < 1 || puerto > 65535) puerto = 9100;
        byte[] datos;
        try {
            datos = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return "Ticket no válido";
        }
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(ip, puerto), 4000);
            s.setSoTimeout(4000);
            OutputStream out = s.getOutputStream();
            out.write(datos);
            out.flush();
            return "";
        } catch (Exception e) {
            return "No se pudo conectar con la impresora " + ip + ":" + puerto + ". Revisa que esté encendida y en la misma red Wi-Fi.";
        } finally {
            try { s.close(); } catch (Exception ignorada) { }
        }
    }

    /** Imprime un HTML con el diálogo de impresión de Android. */
    @JavascriptInterface
    public void imprimirHtml(final String html, final String titulo) {
        actividad.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final WebView v = new WebView(actividad);
                vistaImpresion = v;
                v.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView vista, String url) {
                        PrintManager pm = (PrintManager) actividad.getSystemService(Context.PRINT_SERVICE);
                        if (pm == null) return;
                        String nombre = titulo == null || titulo.isEmpty() ? "Ticket BarberaGo" : titulo;
                        pm.print(nombre, vista.createPrintDocumentAdapter(nombre), new PrintAttributes.Builder().build());
                    }
                });
                v.loadDataWithBaseURL("https://barberago.restorago.com/", html, "text/html", "utf-8", null);
            }
        });
    }
}
