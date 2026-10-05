package com.noadstudios.barberago;

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
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
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Puente que la web de BarberaGo usa como window.BarberaGoNativo para imprimir tickets:
 *  - imprimirRed: manda los bytes ESC/POS directo a una impresora térmica de red (puerto 9100), sin apps extra.
 *  - listarBluetooth / imprimirBluetooth: impresoras Bluetooth ya emparejadas en Android (perfil serie SPP).
 *  - imprimirHtml: abre la impresión de Android con el ticket (Mopria o el complemento de la marca).
 * La vista web de Android ignora window.print(), por eso hace falta este puente.
 */
public class Impresora {
    private final Activity actividad;
    private WebView vistaImpresion; // se conserva hasta que termina la impresión

    public Impresora(Activity actividad) {
        this.actividad = actividad;
    }

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PERMISO_BT = "android.permission.BLUETOOTH_CONNECT"; // Android 12+
    static final int PEDIR_BT = 7;

    @JavascriptInterface
    public String version() {
        return "1.2";
    }

    /** En Android 12+ pide el permiso "Dispositivos cercanos"; devuelve false si todavía no lo tiene. */
    private boolean permisoBluetooth() {
        if (Build.VERSION.SDK_INT < 31) return true;
        if (actividad.checkSelfPermission(PERMISO_BT) == PackageManager.PERMISSION_GRANTED) return true;
        actividad.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                actividad.requestPermissions(new String[] { PERMISO_BT }, PEDIR_BT);
            }
        });
        return false;
    }

    private static String errorJson(String mensaje) {
        try {
            return new JSONObject().put("error", mensaje).toString();
        } catch (Exception e) {
            return "{\"error\":\"Bluetooth\"}";
        }
    }

    /** Impresoras (y demás dispositivos) emparejadas: [{nombre, mac}] o {error}. */
    @JavascriptInterface
    public String listarBluetooth() {
        BluetoothAdapter bt = BluetoothAdapter.getDefaultAdapter();
        if (bt == null) return errorJson("Este dispositivo no tiene Bluetooth");
        if (!permisoBluetooth()) return errorJson("Acepta el permiso de Dispositivos cercanos y vuelve a intentar");
        if (!bt.isEnabled()) return errorJson("Enciende el Bluetooth y vuelve a intentar");
        try {
            JSONArray lista = new JSONArray();
            for (BluetoothDevice d : bt.getBondedDevices()) {
                String nombre = d.getName();
                lista.put(new JSONObject().put("nombre", nombre == null ? d.getAddress() : nombre).put("mac", d.getAddress()));
            }
            return lista.toString();
        } catch (SecurityException e) {
            return errorJson("Acepta el permiso de Dispositivos cercanos y vuelve a intentar");
        } catch (Exception e) {
            return errorJson("No se pudo leer la lista de Bluetooth");
        }
    }

    /** Devuelve "" si se imprimió, o el error en español. */
    @JavascriptInterface
    public String imprimirBluetooth(String mac, String base64) {
        BluetoothAdapter bt = BluetoothAdapter.getDefaultAdapter();
        if (bt == null) return "Este dispositivo no tiene Bluetooth";
        if (mac == null || !BluetoothAdapter.checkBluetoothAddress(mac)) return "Elige la impresora Bluetooth en Impresora";
        if (!permisoBluetooth()) return "Acepta el permiso de Dispositivos cercanos y vuelve a imprimir";
        if (!bt.isEnabled()) return "Enciende el Bluetooth para imprimir";
        byte[] datos;
        try {
            datos = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return "Ticket no válido";
        }
        BluetoothSocket s = null;
        try {
            BluetoothDevice d = bt.getRemoteDevice(mac);
            try {
                s = d.createRfcommSocketToServiceRecord(SPP);
                s.connect();
            } catch (Exception primero) {
                // Algunas impresoras baratas solo aceptan la conexión sin cifrar.
                try { if (s != null) s.close(); } catch (Exception ignorada) { }
                s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                s.connect();
            }
            OutputStream out = s.getOutputStream();
            // En trozos: el búfer de muchas impresoras Bluetooth es chico.
            for (int i = 0; i < datos.length; i += 512) {
                out.write(datos, i, Math.min(512, datos.length - i));
                out.flush();
                Thread.sleep(20);
            }
            Thread.sleep(Math.min(3000, 300 + datos.length / 8)); // que termine de recibir antes de cerrar
            return "";
        } catch (SecurityException e) {
            return "Acepta el permiso de Dispositivos cercanos y vuelve a imprimir";
        } catch (Exception e) {
            return "No se pudo conectar con la impresora Bluetooth. Revisa que esté encendida, emparejada y cerca.";
        } finally {
            try { if (s != null) s.close(); } catch (Exception ignorada) { }
        }
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
