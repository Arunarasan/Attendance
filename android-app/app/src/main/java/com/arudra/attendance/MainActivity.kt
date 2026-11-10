package com.arudra.attendance

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/** Thin shell: loads the deployed web app and bridges the Keystore. The web app keeps the pair-once token in localStorage. */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(KeystoreBridge(), "AndroidKeystore")
        web.addJavascriptInterface(WifiBridge(applicationContext), "AndroidWifi")
        web.webViewClient = object : WebViewClient() {
            // Keep navigation inside the app's own origin.
            override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean =
                !request.url.toString().startsWith(BuildConfig.APP_URL)
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
                cb.invoke(origin, hasLocation(), false)
            }
            override fun onPermissionRequest(request: PermissionRequest) { request.grant(request.resources) }
        }

        // Location (geo-fence, WiFi BSSID) and camera (face check) are runtime permissions.
        val missing = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.CAMERA).filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
        // /app/pair is shown by the web app itself when this phone has no device token yet.
        web.loadUrl(BuildConfig.APP_URL)
    }

    private fun hasLocation() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
