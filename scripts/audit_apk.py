#!/usr/bin/env python3
"""Focused static APK checks. This is not a malware-engine verdict."""
import argparse
import hashlib
import json
import re
import struct
import subprocess
import zipfile
from pathlib import Path
from urllib.parse import urlsplit


def dex_strings(data):
    count, offset = struct.unpack_from('<II', data, 56)
    result = []
    for i in range(count):
        pos = struct.unpack_from('<I', data, offset + i * 4)[0]
        while data[pos] & 128:
            pos += 1
        pos += 1
        end = data.index(b'\0', pos)
        result.append(data[pos:end].decode('utf-8', errors='replace'))
    return result


def audit(apk, aapt, release):
    def dump(*args):
        return subprocess.check_output([aapt, 'dump', *args], text=True)
    permissions = dump('permissions', str(apk))
    manifest = dump('xmltree', str(apk), 'AndroidManifest.xml')
    badging = dump('badging', str(apk))
    uses = re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'", permissions)
    with zipfile.ZipFile(apk) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entries'
        strings = [s for name in names if re.fullmatch(r'classes\d*\.dex', name)
                   for s in dex_strings(archive.read(name))]
    urls = sorted({s for s in strings if s.startswith(('https://', 'http://'))})
    code_files = [name for name in names if name.endswith(('.so', '.jar', '.apk', '.js'))]
    flagged = sorted({s for s in strings if re.search(
        r'addJavascriptInterface|Landroid/webkit/JavascriptInterface;|Ldalvik/system/(?:DexClassLoader|InMemoryDexClassLoader|PathClassLoader);|Ljava/lang/(?:Runtime|ProcessBuilder);|Landroid/accessibilityservice/', s)})
    debug = 'application-debuggable' in badging
    checks = {
        'internet_only': uses == ['android.permission.INTERNET'],
        'not_debuggable': not debug,
        'backup_disabled': bool(re.search(r'android:allowBackup\([^\n]+\)=\(type 0x12\)0x0\b', manifest)),
        'cleartext_disabled': bool(re.search(r'android:usesCleartextTraffic\([^\n]+\)=\(type 0x12\)0x0\b', manifest)),
        'no_native_or_embedded_code': not code_files,
        'no_legacy_bridge_or_dynamic_execution': not flagged,
        'only_production_https_origin': bool(urls) and all(
            urlsplit(url).scheme == 'https'
            and urlsplit(url).hostname == 'lineagem-boss-alarm.onrender.com'
            and urlsplit(url).port in (None, 443)
            and urlsplit(url).username is None for url in urls),
        'no_extra_components': not re.search(r'E: (?:service|receiver|provider)\b', manifest),
    }
    result = {'apk': apk.name, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
              'size_bytes': apk.stat().st_size, 'permissions': uses, 'debuggable': debug,
              'urls': urls, 'embedded_code': code_files, 'flagged_api_strings': flagged,
              'checks': checks, 'release_gate_requested': release,
              'scope': 'Focused static checks only; no Samsung or antivirus-engine verdict.'}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if release and not all(checks.values()):
        raise SystemExit('APK security gate failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=Path)
    parser.add_argument('--aapt', required=True)
    parser.add_argument('--release', action='store_true')
    args = parser.parse_args()
    audit(args.apk, args.aapt, args.release)
