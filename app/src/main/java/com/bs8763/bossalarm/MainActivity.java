package com.bs8763.bossalarm;

import android.app.*;
import android.os.*;
import android.graphics.Color;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final String origin=BuildConfig.APP_URL;
  private String token="";
  private LinearLayout page,rows;
  private TextView feedback;
  private JSONArray bosses=new JSONArray();
  private boolean loading=false;
  private final DateTimeFormatter fmt=DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.of("Asia/Seoul"));
  private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
  private TextView label(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextColor(Color.WHITE);t.setTextSize(size);t.setPadding(dp(8),dp(8),dp(8),dp(8));return t;}
  private Button button(String s,View.OnClickListener cb){Button b=new Button(this);b.setText(s);b.setOnClickListener(cb);return b;}
  private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
  private void screen(String title){ScrollView sc=new ScrollView(this);page=column();page.setPadding(dp(12),dp(20),dp(12),dp(24));page.setBackgroundColor(Color.rgb(17,26,43));sc.addView(page);setContentView(sc);page.addView(label(title,24));feedback=label("",14);page.addView(feedback);}
  private void notice(String s){if(feedback!=null)feedback.setText(s);}
  @Override public void onCreate(Bundle state){super.onCreate(state);login();}
  private void login(){screen("⚔ 혈맹 보스탐");page.addView(label("운영 서버: "+origin,12));EditText key=new EditText(this);key.setSingleLine(true);key.setHint("혈맹 접속 키");key.setTextColor(Color.WHITE);key.setHintTextColor(Color.LTGRAY);key.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);page.addView(key);page.addView(button("연결",v->{String k=key.getText().toString().trim();if(k.isEmpty()){notice("접속 키를 입력하세요");return;}token=k;call("GET","/api/session",null,false,o->{board();refresh();},e->{token="";notice(e);});}));notice("키는 기기에 저장하지 않습니다.");}
  private void board(){screen("⚔ 혈맹 보스탐");page.addView(button("새로고침",v->refresh()));page.addView(button("로그아웃",v->{token="";bosses=new JSONArray();login();}));rows=column();page.addView(rows);}
  private String showTime(String s){try{return fmt.format(Instant.parse(s));}catch(Exception e){return "미등록";}}
  private void draw(){if(rows==null)return;rows.removeAllViews();for(int i=0;i<bosses.length();i++){JSONObject b=bosses.optJSONObject(i);if(b==null)continue;String name=b.optString("name");LinearLayout item=column();item.setPadding(dp(5),dp(5),dp(5),dp(5));item.setBackgroundColor(Color.rgb(35,49,70));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(9);rows.addView(item,lp);item.addView(label(name+" · 맵 "+b.optString("mapNumber","?"),19));item.addView(label("다음 "+showTime(b.optString("time"))+" · 멍 "+b.optInt("misses")+"회",14));LinearLayout actions=new LinearLayout(this);item.addView(actions);actions.addView(button("컷",v->act(b,"cut",null)));actions.addView(button("멍",v->act(b,"miss",null)));actions.addView(button("예약",v->schedule(b)));}}
  private void schedule(JSONObject b){EditText field=new EditText(this);field.setSingleLine(true);field.setTextColor(Color.BLACK);field.setHint("HHmm");new AlertDialog.Builder(this).setTitle(b.optString("name")+" 예약 (한국시간 HHmm)").setView(field).setNegativeButton("취소",null).setPositiveButton("예약",(d,w)->{try{String s=field.getText().toString().trim();if(!s.matches("[0-9]{4}"))throw new Exception();int hh=Integer.parseInt(s.substring(0,2)),mm=Integer.parseInt(s.substring(2));if(hh>23||mm>59)throw new Exception();ZonedDateTime now=ZonedDateTime.now(ZoneId.of("Asia/Seoul"));ZonedDateTime target=now.withHour(hh).withMinute(mm).withSecond(0).withNano(0);if(!target.isAfter(now))target=target.plusDays(1);act(b,"schedule",target.toInstant().toString());}catch(Exception e){notice("시간은 HHmm 형식으로 입력하세요. 예: 2030");}}).show();}
  private void act(JSONObject b,String action,String time){new AlertDialog.Builder(this).setTitle(b.optString("name")+" "+action).setMessage("서버와 디스코드에 기록합니다.").setNegativeButton("취소",null).setPositiveButton("확인",(d,w)->{try{JSONObject payload=new JSONObject();payload.put("action",action);payload.put("expectedVersion",b.opt("version"));if(time!=null)payload.put("time",time);else if("cut".equals(action))payload.put("time",Instant.now().toString());call("POST","/api/bosses/"+URLEncoder.encode(b.optString("id"),"UTF-8")+"/action",payload,false,o->{notice("저장 완료");refresh();},this::notice);}catch(Exception e){notice(e.getMessage());}}).show();}
  private void refresh(){if(token.isEmpty())return;call("GET","/api/bosses",null,true,o->{},this::notice);}
  private interface Success{void done(JSONObject o);}
  private interface Failure{void fail(String s);}
  private void call(String method,String path,JSONObject payload,boolean array,Success success,Failure failure){if(loading)return;loading=true;notice("연결 중...");io.execute(()->{String error=null;JSONObject object=null;JSONArray items=null;HttpURLConnection conn=null;try{URL u=new URL(origin+path);conn=(HttpURLConnection)u.openConnection();conn.setConnectTimeout(12000);conn.setReadTimeout(25000);conn.setRequestMethod(method);conn.setRequestProperty("Authorization","Bearer "+token);conn.setRequestProperty("Accept","application/json");conn.setInstanceFollowRedirects(false);if(payload!=null){conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");try(OutputStream out=conn.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}}int code=conn.getResponseCode();InputStream in=code>=400?conn.getErrorStream():conn.getInputStream();if(in==null)throw new IOException("서버 응답 없음");ByteArrayOutputStream buf=new ByteArrayOutputStream();byte[] block=new byte[4096];int n;while((n=in.read(block))>=0){buf.write(block,0,n);if(buf.size()>2000000)throw new IOException("응답 크기 초과");}String response=buf.toString("UTF-8");if(code>=300){try{error=new JSONObject(response).optString("error","HTTP "+code);}catch(Exception ex){error="HTTP "+code;}}else if(array)items=new JSONArray(response);else object=new JSONObject(response);}catch(Exception e){error="서버 연결 오류: "+e.getMessage();}finally{if(conn!=null)conn.disconnect();}final String err=error;final JSONObject result=object;final JSONArray data=items;ui.post(()->{loading=false;if(err!=null){failure.fail(err);return;}if(array){bosses=data;draw();notice("동기화 완료 · "+bosses.length()+"종");}else success.done(result);});});}
  @Override protected void onDestroy(){io.shutdownNow();token="";super.onDestroy();}
}
