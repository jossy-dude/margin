#!/usr/bin/env python3
"""Move every place the app's version lives together (RELEASING.md §4): app.json, the shipped gradle file, the
runtime-version string, APP_VERSION and the native-config test that holds them together.

    python3 tools/bump.py 0.7.7.1 "what this release is"
"""
import pathlib
import re
import sys

new, why = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''
gradle = pathlib.Path('android/app/build.gradle')
g = gradle.read_text()
old = re.search(r'versionName "([^"]+)"', g).group(1)
code = int(re.search(r'versionCode (\d+)', g).group(1))
gradle.write_text(g.replace(f'versionCode {code}', f'versionCode {code + 1}').replace(f'versionName "{old}"', f'versionName "{new}"'))


def sub(path, a, b):
    p = pathlib.Path(path)
    s = p.read_text()
    assert a in s, (path, a)
    p.write_text(s.replace(a, b))


sub('app.json', f'"version": "{old}"', f'"version": "{new}"')
sub('android/app/src/main/res/values/strings.xml', f'>{old}</string>', f'>{new}</string>')
sub('src/domain/version.ts', f"APP_VERSION = '{old}'", f"APP_VERSION = '{new}'")
t = pathlib.Path('src/test/native-config.test.ts')
s = t.read_text()
s = re.sub(r"it\('ships as [^,]+, version code \d+'", f"it('ships as {new}, version code {code + 1}'", s)
s = re.sub(r"    // 0\.7\.7[^\n]*\n", f"    // {new}: {why} {old} was version code {code}.\n", s, count=1)
s = s.replace(f"toBe('{old}')", f"toBe('{new}')").replace(f'versionCode {code}\\b', f'versionCode {code + 1}\\b')
s = s.replace(f'versionName "{old}"', f'versionName "{new}"').replace(f'>{old}</string>', f'>{new}</string>')
t.write_text(s)
print(f'{old} ({code}) -> {new} ({code + 1})')
