package com.bs8763.bossalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.graphics.Color;
import android.view.View;
import android.widget.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private TextView status;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private static final int PICK_FILE=11, SAVE_BACKUP=12;
    private boolean trusted(Uri u) {
        Uri origin=Uri.parse(BuildConfig.APP_URL);
        return "https".equals(u.getScheme()) && origin.getHost().equals(u.getHost()) && origin.getPort()==u.getPort() && u.getUserInfo()==null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout=new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);layout.setBackgroundColor(Color.rgb(16,24,39));
        // System bar insets keep controls visible on Android 15 edge-to-edge.
        layout.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        status=new TextView(this); status.setTextColor(Color.WHITE);status.setPadding(24,12,24,12);status.setText("서버 연결 중 · 절전 해제는 약 1분 걸릴 수 있습니다");layout.addView(status);
        Button retry=new Button(this);retry.setText("새로고침 / 연결 재시도");retry.setOnClickListener(v->web.loadUrl(BuildConfig.APP_URL));layout.addView(retry);
        web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setSafeBrowsingEnabled(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new BackupBridge(),"BossBackup");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !trusted(req.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){if(!trusted(req.getUrl()))return new WebResourceResponse("text/plain","utf-8",new java.io.ByteArrayInputStream(new byte[0]));return null;}
            @Override public void onSafeBrowsingHit(WebView view,WebResourceRequest request,int threatType,SafeBrowsingResponse callback){
                if(android.os.Build.VERSION.SDK_INT >= 27) callback.backToSafety(true);
                else view.stopLoading();
                status.setText("보안 경고 · 위험한 페이지 접근이 차단되었습니다");
            }
            @Override public void onPageFinished(WebView view,String url){if(trusted(Uri.parse(url)))status.setText("혈맹 보스탐 · 한국시간 · 앱 종료 시 접속 키 삭제");else status.setText("허용되지 않은 페이지가 차단되었습니다");}
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){if(req.isForMainFrame())status.setText("연결 실패 · 위 버튼으로 다시 시도하세요");}
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();status.setText("인증서 확인 실패");}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsPrompt(WebView v,String url,String message,String defaultValue,JsPromptResult result){EditText input=new EditText(MainActivity.this);input.setText(defaultValue);new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setPositiveButton("확인",(d,w)->result.confirm(input.getText().toString())).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_FILE);return true;}
        });
        web.loadUrl(BuildConfig.APP_URL);
    }
    private class BackupBridge {
        @JavascriptInterface public void save(String json){
            if(json==null||json.length()>1500000)return;
            try { if(new JSONObject(json).getInt("schemaVersion")!=2)return; }catch(Exception e){return;}
            runOnUiThread(()->{if(pendingBackup!=null)return;pendingBackup=json;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"boss-backup.json");startActivityForResult(i,SAVE_BACKUP);});
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==PICK_FILE&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
        if(request==SAVE_BACKUP){String backup=pendingBackup;pendingBackup=null;if(result==RESULT_OK&&data!=null&&backup!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(backup.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"백업 저장 완료",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"백업 저장 실패",Toast.LENGTH_LONG).show();}}}
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("BossBackup");web.destroy();}super.onDestroy();}
}
