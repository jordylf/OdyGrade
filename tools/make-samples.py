"""Original synthetic test scene. Pillow is a development-only dependency."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math, random
random.seed(71)
root=Path(__file__).resolve().parents[1]
out=root/"assets"; out.mkdir(exist_ok=True)
w,h=960,540
im=Image.new("RGB",(w,h)); px=im.load()
for y in range(h):
    for x in range(w):
        t=y/h; noise=random.uniform(-2,2)
        sky=(85+64*t,133+29*t,157-12*t)
        px[x,y]=tuple(max(0,min(255,int(v+noise))) for v in sky)
d=ImageDraw.Draw(im)
d.ellipse((650,35,760,145),fill=(230,223,179))
d.polygon([(0,280),(100,180),(220,230),(320,170),(460,290),(600,220),(760,260),(960,190),(960,540),(0,540)],fill=(74,102,99))
d.polygon([(0,340),(200,280),(400,320),(610,275),(800,340),(960,290),(960,540),(0,540)],fill=(62,88,79))
d.polygon([(0,370),(960,360),(960,540),(0,540)],fill=(85,86,80))
d.polygon([(470,340),(540,340),(850,540),(210,540)],fill=(140,140,124))
d.polygon([(497,360),(508,360),(550,540),(510,540)],fill=(185,179,142))
# Houses and architectural color patches
for x,y,bw,bh,c in [(30,200,210,207,(147,155,134)),(240,240,130,135,(185,171,139)),(695,190,220,190,(170,146,117)),(610,260,90,110,(118,138,130))]:
    d.rectangle((x,y,x+bw,y+bh),fill=c)
    d.polygon([(x-10,y),(x+bw//2,y-68),(x+bw+12,y)],fill=(74,80,72))
    for wy in range(y+25,y+bh-30,60):
        for wx in range(x+20,x+bw-20,53):
            d.rectangle((wx,wy,wx+23,wy+36),fill=(47,74,79))
            d.line((wx+12,wy,wx+12,wy+36),fill=(115,130,113),width=2)
    d.rectangle((x+bw//2-15,y+bh-60,x+bw//2+15,y+bh),fill=(59,74,67))
# Trees, foreground foliage, visible skin-colored subject
for x,y,r in [(0,270,95),(930,235,115),(65,370,55),(890,380,65)]:
    d.rectangle((x-8,y,x+8,450),fill=(55,68,52))
    for k in range(25):
        xx=x+random.randint(-r,r); yy=y+random.randint(-r,r//2)
        d.ellipse((xx-32,yy-32,xx+32,yy+32),fill=(random.randint(44,64),random.randint(75,105),random.randint(49,73)))
d.ellipse((441,260,477,300),fill=(189,137,103))
d.polygon([(440,302),(478,302),(491,389),(428,389)],fill=(133,72,57))
d.polygon([(436,388),(454,388),(450,466),(432,466)],fill=(51,67,75))
d.polygon([(459,388),(477,388),(486,466),(468,466)],fill=(47,64,74))
d.line((444,312,415,370),fill=(176,126,94),width=11)
d.line((475,314,499,365),fill=(183,132,99),width=11)
im=im.filter(ImageFilter.GaussianBlur(.35))
im.save(out/"sample-source.png")
print(out/"sample-source.png")
