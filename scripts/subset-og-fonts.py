# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools>=4.50", "brotli"]
# ///
"""OG 이미지용 폰트 서브셋 생성.

Satori(next/og)는 woff2를 못 읽고(ttf/otf/woff만), 저장소의 Pretendard는 Variable woff2 하나뿐이다.
전체 OTF는 무게당 ~2.5MB라 요청마다 파싱하기엔 무겁다 → KS X 1001 한글 2,350자 + 기본 라틴/문장부호로
잘라 무게당 수백 KB로 만든다. Oswald는 Variable TTF라 정적 인스턴스로 뽑는다(Satori는 variable 축을 못 탄다).
"""
import io
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

PRETENDARD = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/{name}.otf"
OSWALD = "https://github.com/google/fonts/raw/main/ofl/oswald/Oswald%5Bwght%5D.ttf"


def fetch(url: str) -> bytes:
    print("GET", url)
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def ksx1001_hangul() -> str:
    # Python의 euc_kr 코덱은 KS X 1001 완성형 2,350자만 2바이트로 인코딩한다(그 밖은 8바이트 확장).
    out = []
    for cp in range(0xAC00, 0xD7A4):
        ch = chr(cp)
        try:
            if len(ch.encode("euc_kr")) == 2:
                out.append(ch)
        except UnicodeEncodeError:
            pass
    return "".join(out)


HANGUL = ksx1001_hangul()
print(f"KS X 1001 한글 {len(HANGUL)}자")

# 라틴·문장부호·기호: ASCII 전체 + Latin-1 보충 일부 + 한글 자모(ㄱ-ㅎ ㅏ-ㅣ) + 자주 쓰는 기호
UNICODES_COMMON = [
    "U+0020-007E",  # ASCII
    "U+00A0-00FF",  # Latin-1 supplement (·, ×, °, ½ …)
    "U+2010-2027",  # dashes, quotes, bullet, ellipsis
    "U+2030-205E",  # ‰ ′ ″ ‹ › …
    "U+20A9",       # ₩
    "U+2100-214F",  # ℃ № ™ …
    "U+2190-2199",  # arrows
    "U+2200-22FF",  # math (≈ ≠ ≤ ≥ …)
    "U+2460-24FF",  # circled numbers ①②③
    "U+25A0-25FF",  # geometric shapes ■□▶
    "U+2600-26FF",  # misc symbols ★☆♡
    "U+2700-27BF",  # dingbats ✓✔
    "U+3000-303F",  # CJK punctuation 「」『』
    "U+3131-318E",  # Hangul compatibility jamo
    "U+FF01-FF5E",  # fullwidth ASCII
]


def run_subset(font: TTFont, text: str, unicodes: list[str]) -> TTFont:
    opts = subset.Options()
    opts.layout_features = ["*"]  # kern 등 유지
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.recalc_timestamp = False
    opts.drop_tables += ["DSIG"]
    s = subset.Subsetter(options=opts)
    s.populate(text=text, unicodes=subset.parse_unicodes(",".join(unicodes)))
    s.subset(font)
    return font


for weight_name in ("Bold", "ExtraBold"):
    raw = fetch(PRETENDARD.format(name=f"Pretendard-{weight_name}"))
    font = TTFont(io.BytesIO(raw))
    font = run_subset(font, HANGUL, UNICODES_COMMON)
    dst = OUT / f"pretendard-{weight_name.lower()}.subset.otf"
    font.save(dst)
    print(f"{dst.name}: {len(raw)//1024}KB -> {dst.stat().st_size//1024}KB")

oswald_raw = fetch(OSWALD)
for wght in (500, 700):
    vf = TTFont(io.BytesIO(oswald_raw))
    static = instancer.instantiateVariableFont(vf, {"wght": wght})
    static = run_subset(static, "", ["U+0020-007E", "U+00A0-00FF", "U+2010-2027"])
    dst = OUT / f"oswald-{wght}.subset.ttf"
    static.save(dst)
    print(f"{dst.name}: {dst.stat().st_size//1024}KB")
