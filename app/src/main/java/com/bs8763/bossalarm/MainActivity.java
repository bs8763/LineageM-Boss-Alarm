package com.bs8763.bossalarm;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LinearLayout root, list;
    private TextView status;
    private EditText tokenInput;
    private String token="";
    private boolean busy=false;
    private JSONArray bosses=new JSONArray();
    private final DateTimeFormatter dateFmt=DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.of("Asia/Seoul"));
    private final Runnable refresh=new Runnable(){public void run(){if(!token.isEmpty()&&!busy)load();handler.postDelayed(this,30000);}};
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private TextView text(String s,int size){TextView v=new TextView(this);v.setText(s);v.setTextColor(Color.WHITE);v.setTextSize(size);v.setPadding(dp(8),dp(8),dp(8),dp(8));return v;}
    private Button button(String label,View.OnClickListener click){Button b=new Button(this);b.setText(label);b.setOnClickListener(click);return b;}
    private LinearLayout vertical(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private void message(String s){status.setText(s);}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);showLogin();handler.postDelayed(refresh,30000);}
    private void base(String title){ScrollView scroll=new ScrollView(this);root=vertical();root.setPadding(dp(12),dp(20),dp(12),dp(24));root.setBackgroundColor(Color.rgb(16,24,39));scroll.addView(root);setContentView(scroll);root.addView(text(title,24));status=text("",14);root.addView(status);}
    private void showLogin(){base("⚔ 혈맹 보스탐");root.addView(text("네이티브 Android · 서버 및 디스코드 연동",14));tokenInput=new EditText(this);tokenInput.setSingleLine(true);tokenInput.setHint("혈맹 접속 키 또는 관리자 키");tokenInput.setTextColor(Color.WHITE);tokenInput.setHintTextColor(Color.LTGRAY);tokenInput.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);root.addView(tokenInput);root.addView(button("접속하기",v->{String key=tokenInput.getText().toString().trim();if(key.isEmpty()){message("접속 키를 입력하세요");return;}token=key;request("GET","/api/session",null,data->{showBoard();load();},e->{token="";message(e);} );}));message("접속 키는 앱을 종료하면 지워집니다.");}
    private void showBoard(){base("⚔ 혈맹 보스탐");LinearLayout bar=new LinearLayout(this);bar.addView(button("새로고침",v->load()));bar.addView(button("로그아웃",v->{token="";bosses=new JSONArray();showLogin();}));root.addView(bar);root.addView(text("컷·멍은 서버에 즉시 기록되고 디스코드로 연동됩니다.",13));list=vertical();root.addView(list);}
    private String time(String value){if(value==null||value.isEmpty()||"null".equals(value))return "미등록";try{return dateFmt.format(Instant.parse(value));}catch(Exception e){return value;}}
    private void render(){if(list==null)return;list.removeAllViews();for(int i=0;i<bosses.length();i++){JSONObject b=bosses.optJSONObject(i);if(b==null)continue;String id=b.optString("id"),name=b.optString("name"),at=b.optString("time");int misses=b.optInt("misses");LinearLayout item=vertical();item.setPadding(dp(6),dp(8),dp(6),dp(8));item.setBackgroundColor(Color.rgb(28,42,61));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(8);list.addView(item,lp);item.addView(text(name+" · 맵 "+b.optString("mapNumber","미확정"),19));item.addView(text("다음 출현: "+time(at)+" · 멍 "+misses+"회",15));LinearLayout actions=new LinearLayout(this);item.addView(actions);actions.addView(button("컷",v->confirmAction(b,"cut")));actions.addView(button("멍",v->confirmAction(b,"miss")));actions.addView(button("시간 예약",v->schedule(b)));}}
    private void confirmAction(JSONObject boss,String action){String name=boss.optString("name");new AlertDialog.Builder(this).setTitle(name+" "+("cut".equals(action)?"컷":"멍")+" 처리").setMessage("서버 기록과 디스코드 알림에 반영됩니다. 계속할까요?").setNegativeButton("취소",null).setPositiveButton("처리",(d,w)->{try{JSONObject body=new JSONObject();body.put("action",action);body.put("expectedVersion",boss.opt("version"));if("cut".equals(action))body.put("time",Instant.now().toString());request("POST","/api/bosses/"+UriEncode(boss.optString("id"))+"/action",body,result->{message(name+" 저장 완료 · 다음 출현 "+time(result.optString("time")));load();},this::message);}catch(Exception e){message(e.getMessage());}}).show();}
    private String UriEncode(String s){try{return java.net.URLEncoder.encode(s,"UTF-8");}catch(Exception e){return s;}}
    private void schedule(JSONObject boss){EditText input=new EditText(this);input.setSingleLine(true);input.setTextColor(Color.BLACK);input.setHint("2026-10-30 21:30");input.setText(java.time.LocalDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));new AlertDialog.Builder(this).setTitle(boss.optString("name")+" 출현 예약 (한국시간)").setView(input).setNegativeButton("취소",null).setPositiveButton("저장",(d,w)->{try{LocalDateTime local=LocalDateTime.parse(input.getText().toString(),DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));JSONObject body=new JSONObject();body.put("action","schedule");body.put("time",local.atZone(ZoneId.of("Asia/Seoul")).toInstant().toString());body.put("expectedVersion",boss.opt("version"));request("POST","/api/bosses/"+UriEncode(boss.optString("id"))+"/action",body,r->load(),this::message);}catch(Exception e){message("시간 형식: yyyy-MM-dd HH:mm");}}).show();}
    private void load(){if(token.isEmpty()||busy)return;request("GET","/api/bosses",null,r->{},this::message,true);}
    private interface Success {void done(JSONObject obj);}
    private interface Failure {void fail(String error);}
    private void request(String method,String path,JSONObject body,Success success,Failure failure){request(method,path,body,success,failure,false);}
    private void request(String method,String path,JSONObject body,Success success,Failure failure,boolean array){if(busy)return;busy=true;message("서버 연결 중…");executor.execute(()->{String error=null;JSONObject result=null;JSONArray items=null;HttpURLConnection conn=null;try{URL url=new URL(BuildConfig.APP_URL+path);conn=(HttpURLConnection)url.openConnection();conn.setConnectTimeout(15000);conn.setReadTimeout(90000);conn.setRequestMethod(method);conn.setInstanceFollowRedirects(false);conn.setRequestProperty("Authorization","Bearer "+token);conn.setRequestProperty("Accept","application/json");if(body!=null){conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");try(OutputStream out=conn.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}int statusCode=conn.getResponseCode();InputStream stream=statusCode>=400?conn.getErrorStream():conn.getInputStream();if(stream==null)throw new IOException("서버 응답 없음");ByteArrayOutputStream buf=new ByteArrayOutputStream();byte[] chunk=new byte[4096];int n;while((n=stream.read(chunk))!=-1){buf.write(chunk,0,n);if(buf.size()>2000000)throw new IOException("응답 크기 초과");}String response=buf.toString("UTF-8");if(statusCode>=300){try{error=new JSONObject(response).optString("error","HTTP "+statusCode);}catch(Exception e){error="HTTP "+statusCode;}}else if(array)items=new JSONArray(response);else result=new JSONObject(response);}catch(Exception e){error="연결 실패: "+e.getMessage();}finally{if(conn!=null)conn.disconnect();}final String failureText=error;final JSONObject data=result;final JSONArray rows=items;handler.post(()->{busy=false;if(failureText!=null){failure.fail(failureText);return;}if(array){bosses=rows;render();message("동기화 완료 · 보스 "+bosses.length()+"종");}else success.done(data);});});}
    @Override protected void onDestroy(){handler.removeCallbacks(refresh);executor.shutdownNow();token="";super.onDestroy();}
}
