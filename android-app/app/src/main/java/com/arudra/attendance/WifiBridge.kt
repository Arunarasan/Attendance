package com.arudra.attendance

import android.content.Context
import android.net.wifi.WifiManager
import android.webkit.JavascriptInterface

/**
 * Exposed as window.AndroidWifi. Returns the connected access point's BSSID, which the server compares with the
 * office list. Needs location permission (already requested) and WiFi to be on; returns "" otherwise.
 */
class WifiBridge(private val context: Context) {
    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun bssid(): String {
        return try {
            val wm = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wm.connectionInfo?.bssid ?: ""
        } catch (e: Exception) {
            ""
        }
    }
}
