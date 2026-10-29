package com.bs8763.bossalarm;
import org.junit.Test;
import static org.junit.Assert.*;
public class OriginPolicyTest {
    private static final String BASE="https://lineagem-boss-alarm.onrender.com";
    @Test public void permitsSameOriginAndHttpsDefaultPort(){
        assertTrue(OriginPolicy.allows(BASE,BASE+"/api/admin/backup"));assertTrue(OriginPolicy.allows(BASE,BASE+":443/path?q=value#fragment"));
    }
    @Test public void rejectsRedirectAndSchemeConfusion(){
        String[] blocked={null,"","http://lineagem-boss-alarm.onrender.com","https://lineagem-boss-alarm.onrender.com.evil.test/","https://evil.test/","https://user@lineagem-boss-alarm.onrender.com/","https://lineagem-boss-alarm.onrender.com:444/","javascript:alert(1)","data:text/html,test","file:///etc/passwd","content://provider/file","intent://open","https://lineagem-boss-alarm.onrender.com\\@evil.test/","//lineagem-boss-alarm.onrender.com/"};
        for(String url:blocked)assertFalse(String.valueOf(url),OriginPolicy.allows(BASE,url));
    }
}
