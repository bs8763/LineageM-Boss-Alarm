package com.bs8763.bossalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.net.Uri;
import android.content.Intent;
import android.widget.Toast;

/**
 * Android shell for the same HTTPS clan board used by the Discord bot.
 * No JavaScript bridge, credential storage, or cleartext fallback.
 */
public class MainActivity extends Activity {
    private WebView board;
    private String origin;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        origin = BuildConfig.APP_URL.replaceAll("/+$", "");
        Uri base = Uri.parse(origin);
        if (!"https".equalsIgnoreCase(base.getScheme()) || base.getHost() == null) {
            new AlertDialog.Builder(this).setMessage("HTTPS 서버 주소가 올바르지 않습니다.")
                .setPositiveButton("종료", (d,w) -> finish()).show();
            return;
        }
        board = new WebView(this);
        board.setBackgroundColor(0xff101827);
        board.getSettings().setJavaScriptEnabled(true);
        board.getSettings().setDomStorageEnabled(true);
        board.getSettings().setAllowFileAccess(false);
        board.getSettings().setAllowContentAccess(false);
        board.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        board.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        board.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (sameOrigin(uri)) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception e) { Toast.makeText(MainActivity.this, "외부 링크를 열 수 없습니다.", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("보안 연결 오류")
                    .setMessage("서버 인증서를 확인할 수 없어 연결을 차단했습니다.")
                    .setPositiveButton("확인", null).show();
            }
        });
        board.setWebChromeClient(new WebChromeClient());
        setContentView(board);
        board.loadUrl(origin + "/");
    }

    private boolean sameOrigin(Uri uri) {
        Uri base = Uri.parse(origin);
        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        int basePort = base.getPort() == -1 ? 443 : base.getPort();
        return "https".equalsIgnoreCase(uri.getScheme())
            && base.getHost().equalsIgnoreCase(uri.getHost()) && port == basePort;
    }

    @Override public void onBackPressed() {
        if (board != null && board.canGoBack()) board.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (board != null) { board.destroy(); board = null; }
        super.onDestroy();
    }
}
