package com.bs8763.bossalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.Uri;
import android.content.Intent;
import android.graphics.Color;

/**
 * Single-origin clan board shell. The server owns authentication, boss state,
 * cut/miss actions and admin permissions. No editable server URL or native
 * duplicate boss board: Android displays the same UI as the clan web board.
 */
public final class MainActivity extends Activity {
    private WebView board;
    private String origin;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        origin = BuildConfig.APP_URL.replaceAll("/+$", "");
        board = new WebView(this);
        board.setBackgroundColor(Color.rgb(16, 24, 39));
        board.getSettings().setJavaScriptEnabled(true);
        board.getSettings().setDomStorageEnabled(false);
        board.getSettings().setAllowFileAccess(false);
        board.getSettings().setAllowContentAccess(false);
        board.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        board.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        board.setWebChromeClient(new WebChromeClient());
        board.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                Uri allowed = Uri.parse(origin);
                if ("https".equals(uri.getScheme()) && allowed.getHost().equalsIgnoreCase(uri.getHost())
                        && uri.getPort() == allowed.getPort()) return false;
                if ("https".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request,
                                                    android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) new AlertDialog.Builder(MainActivity.this)
                    .setTitle("보스탐 연결 실패")
                    .setMessage("서버 연결을 확인하고 다시 시도하세요.")
                    .setPositiveButton("다시 연결", (d,w) -> board.loadUrl(origin + "/"))
                    .setNegativeButton("닫기", null).show();
            }
        });
        setContentView(board);
        board.loadUrl(origin + "/");
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
