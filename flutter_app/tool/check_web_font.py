#!/usr/bin/env python3
"""Fail if any non-ASCII character used in lib/ is missing from the bundled web CJK font."""
import glob, sys
from fontTools.ttLib import TTFont
cm = set(TTFont('web/fonts/jj-cjk-sc.otf').getBestCmap())
miss = {}
for f in glob.glob('lib/**/*.dart', recursive=True):
    for ch in open(f, encoding='utf8').read():
        o = ord(ch)
        if o > 0x7f and o not in cm and not (0x1F000 <= o <= 0x1FFFF) and not (0xFE00 <= o <= 0xFE0F):
            miss.setdefault(ch, f)
if miss:
    print('web font missing:', miss); sys.exit(1)
print('web font covers all UI characters')
