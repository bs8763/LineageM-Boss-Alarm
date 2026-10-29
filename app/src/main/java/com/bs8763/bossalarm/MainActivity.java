package com.bs8763.bossalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int PICK_FILE=11, SAVE_BACKUP=12, MAX_BACKUP_BYTES=1500000;
    private final ExecutorService backupWorker=Executors.newSingleThreadExecutor();
    private WebView web;
    private TextView status;
    private Button backupButton;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingBackup;
    private boolean destroyed;
    private boolean trusted(String url) { return OriginPolicy.allows(BuildConfig.APP_URL,url); }
    private boolean trusted(Uri url) { return url!=null && trusted(url.toString()); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.rgb(16,24,39));
        layout.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        status=new TextView(this);status.setTextColor(Color.WHITE);status.setPadding(24,12,24,12);
        status.setText("서버 연결 중 · 절전 해제는 약 1분 걸릴 수 있습니다");layout.addView(status);
        Button retry=new Button(this);retry.setText("새로고침 / 연결 재시도");
        retry.setOnClickListener(v->web.loadUrl(BuildConfig.APP_URL));layout.addView(retry);
        backupButton=new Button(this);backupButton.setText("관리자 백업 저장");
        backupButton.setOnClickListener(v->requestBackup());layout.addView(backupButton);
        web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        // No Java object or messaging endpoint is exposed to web JavaScript.
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !trusted(req.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                if(!trusted(req.getUrl()))return new WebResourceResponse("text/plain","utf-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));return null;
            }
            @Override public void onPageFinished(WebView view,String url){status.setText(trusted(url)?"혈맹 보스탐 · 한국시간 · 앱 종료 시 접속 키 삭제":"허용되지 않은 주소입니다");}
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){if(req.isForMainFrame())status.setText("연결 실패 · 위 버튼으로 다시 시도하세요");}
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();status.setText("인증서 확인 실패 · 연결을 중단했습니다");}
        });
        web.setDownloadListener((url,agent,disposition,mime,length)->Toast.makeText(this,"백업은 앱 상단의 관리자 백업 저장 버튼을 사용하세요",Toast.LENGTH_LONG).show());
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){
                if(!trusted(url)){result.cancel();return true;}
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){
                if(!trusted(url)){result.cancel();return true;}
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsPrompt(WebView v,String url,String message,String defaultValue,JsPromptResult result){
                if(!trusted(url)){result.cancel();return true;}
                EditText input=new EditText(MainActivity.this);input.setText(defaultValue);
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setPositiveButton("확인",(d,w)->result.confirm(input.getText().toString())).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!trusted(view.getUrl())){callback.onReceiveValue(null);return true;}
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_FILE);return true;
            }
        });web.loadUrl(BuildConfig.APP_URL);
    }
    private void requestBackup(){
        if(pendingBackup!=null)return;
        EditText input=new EditText(this);input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("관리자 백업 저장")
            .setMessage("관리자 키를 입력하세요. 키는 저장하지 않으며 기존 서버에서 백업을 읽기만 합니다.")
            .setView(input).setPositiveButton("백업 읽기",(d,w)->{
                String token=input.getText().toString().trim();input.setText("");
                if(token.length()<24||token.length()>256||token.contains("\r")||token.contains("\n")){Toast.makeText(this,"관리자 키를 확인하세요",Toast.LENGTH_LONG).show();return;}
                backupButton.setEnabled(false);backupWorker.execute(()->downloadBackup(token));
            }).setNegativeButton("취소",null).create();
        dialog.setOnDismissListener(d->input.setText(""));dialog.show();
    }
    private void downloadBackup(String token){
        HttpsURLConnection connection=null;
        try{
            URL url=new URL(BuildConfig.APP_URL+"/api/admin/backup");if(!trusted(url.toString()))throw new java.io.IOException("Origin");
            connection=(HttpsURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
            connection.setConnectTimeout(20000);connection.setReadTimeout(70000);
            connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/json");
            if(connection.getResponseCode()!=200||connection.getContentType()==null||!connection.getContentType().startsWith("application/json"))throw new java.io.IOException("Response");
            byte[] bytes;
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] block=new byte[8192];int n;while((n=in.read(block))!=-1){if(out.size()+n>MAX_BACKUP_BYTES)throw new java.io.IOException("Size");out.write(block,0,n);}bytes=out.toByteArray();
            }
            JSONObject snapshot=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            if(snapshot.getInt("schemaVersion")!=2||snapshot.getJSONArray("bosses").length()>100)throw new java.io.IOException("Schema");
            runOnUiThread(()->{
                if(destroyed)return;pendingBackup=bytes;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);
                i.putExtra(Intent.EXTRA_TITLE,"boss-backup.json");startActivityForResult(i,SAVE_BACKUP);
            });
        }catch(Exception ignored){runOnUiThread(()->{if(!destroyed)Toast.makeText(this,"백업 읽기 실패 · 관리자 키와 연결을 확인하세요",Toast.LENGTH_LONG).show();});}
        finally{if(connection!=null)connection.disconnect();runOnUiThread(()->{if(!destroyed)backupButton.setEnabled(true);});}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);Uri uri=result==RESULT_OK&&data!=null?data.getData():null;
        if(uri!=null&&!"content".equals(uri.getScheme()))uri=null;
        if(request==PICK_FILE&&fileCallback!=null){fileCallback.onReceiveValue(uri==null?null:new Uri[]{uri});fileCallback=null;}
        if(request==SAVE_BACKUP){byte[] bytes=pendingBackup;pendingBackup=null;
            if(uri!=null&&bytes!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(uri)){
                if(out==null)throw new java.io.IOException("Document");out.write(bytes);Toast.makeText(this,"백업 저장 완료",Toast.LENGTH_SHORT).show();
            }catch(Exception ignored){Toast.makeText(this,"백업 저장 실패",Toast.LENGTH_LONG).show();}}
        }
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){
        destroyed=true;backupWorker.shutdownNow();pendingBackup=null;if(fileCallback!=null)fileCallback.onReceiveValue(null);
        if(web!=null){web.stopLoading();web.clearCache(true);web.clearHistory();web.destroy();}super.onDestroy();
    }
}
