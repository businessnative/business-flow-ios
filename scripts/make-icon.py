# iOS app icon (1024, full-bleed, no alpha): BN base #0a0a0b, dot-matrix arrow #f6f3ec, accent tip #c0c0e7.
# Same geometry as bn-flow-mac/scripts/make-icon.swift.
from PIL import Image, ImageDraw
import sys
circles = [(1.4,1.4),(1.4,4.6),(1.4,7.8),(1.4,11),(5.4,3),(5.4,6.2),(5.4,9.4),(9.4,4.6),(9.4,7.8),(13.4,6.2)]
def render(S, bg=(10,10,11), out='assets/icon.png', frac=0.5):
    ss = 4; W = S*ss
    im = Image.new('RGB', (W, W), bg); d = ImageDraw.Draw(im)
    scale = W*frac/15; ox = W/2-15*scale/2; oy = W/2-13*scale/2
    for i,(x,y) in enumerate(circles):
        r = 1.1*scale; col = (192,192,231) if i == len(circles)-1 else (246,243,236)
        d.ellipse([ox+x*scale-r, oy+y*scale-r, ox+x*scale+r, oy+y*scale+r], fill=col)
    im.resize((S,S), Image.LANCZOS).save(out)
render(1024)
render(1024, out='assets/splash-icon.png', frac=0.42)
render(48, out='assets/favicon.png')
print('ok')
