package com.bs8763.bossalarm;
import java.net.URI;
/** Exact HTTPS origin restriction, including canonical default port handling. */
public final class OriginPolicy {
    private OriginPolicy() {}
    public static boolean allows(String configuredOrigin,String candidate){
        if(configuredOrigin==null||candidate==null)return false;
        try{
            URI expected=new URI(configuredOrigin),actual=new URI(candidate);
            return "https".equals(expected.getScheme())&&"https".equals(actual.getScheme())
                &&expected.getHost()!=null&&expected.getHost().equalsIgnoreCase(actual.getHost())
                &&actual.getRawUserInfo()==null&&actual.getRawAuthority()!=null&&port(expected)==port(actual);
        }catch(java.net.URISyntaxException ignored){return false;}
    }
    private static int port(URI uri){return uri.getPort()==-1?443:uri.getPort();}
}
