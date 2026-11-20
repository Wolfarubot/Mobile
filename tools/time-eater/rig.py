from PIL import Image
import numpy as np, math
HERE=__import__('os').path.dirname(__import__('os').path.abspath(__file__))
SRC=HERE+'/source.png'
IM=Image.open(SRC).convert('RGBA')
NECK_Y=212   # where the head sits on the chest (was 203: it floated above it)
# part: box on the sheet, pivot (where it hangs from its parent), joints it carries (sheet coords), parent joint name
P={
 'torso':dict(box=(190,198,247,268),pivot=(218,230),joints={'wing':(218,214),'neck':(218,NECK_Y),'shL':(198,208),'shR':(239,208),'hipL':(207,257),'hipR':(232,257)}),
 'head':dict(box=(184,51,250,188),pivot=(218,184),parent=('torso','neck'),joints={}),
 'uarmL':dict(box=(114,188,174,257),pivot=(168,197),parent=('torso','shL'),joints={'elb':(124,250)}),
 'handL':dict(box=(62,266,136,364),pivot=(123,269),parent=('uarmL','elb'),joints={'grip':(80,330)}),
 'uarmR':dict(box=(268,181,312,227),pivot=(272,184),parent=('torso','shR'),joints={'elb':(305,223)}),
 'handR':dict(box=(302,239,342,331),pivot=(318,244),parent=('uarmR','elb'),joints={'grip':(318,296)}),
 'thighL':dict(box=(176,300,205,337),pivot=(192,303),parent=('torso','hipL'),joints={'knee':(186,333)}),
 'shinL':dict(box=(161,343,190,380),pivot=(178,346),parent=('thighL','knee'),joints={'ank':(175,376)}),
 'footL':dict(box=(139,387,177,444),pivot=(165,390),parent=('shinL','ank'),joints={}),
 'thighR':dict(box=(259,298,285,332),pivot=(271,301),parent=('torso','hipR'),joints={'knee':(274,329)}),
 'shinR':dict(box=(277,345,303,379),pivot=(288,348),parent=('thighR','knee'),joints={'ank':(292,376)}),
 'footR':dict(box=(285,399,334,442),pivot=(294,401),parent=('shinR','ank'),joints={}),
 'staff':dict(box=(449,255,676,431),pivot=(581,346),parent=('handR','grip'),joints={}),
}
GRIP_R=30  # how much of the staff around the grip is drawn over the hand
ORDER=['wingL','wingR','staff','thighL','shinL','footL','thighR','shinR','footR','torso','head','uarmL','handL','uarmR','handR']
CROPS={k:IM.crop(v['box']) for k,v in P.items()}

# ---- The hands were drawn at 2x (every pixel a 2x2 block): bring them in line with the rest of the body. ----
OUTLINE=(32,18,22)       # the body's outline colour
SHADOW=(58,42,46)        # the body's darkest fill
def _native(a):
  # Which 2x2 grid the blocks sit on, then one pixel per block.
  best=None
  for oy in (0,1):
    for ox in (0,1):
      s=a[oy:,ox:]; H=(s.shape[0]//2)*2; W=(s.shape[1]//2)*2; q=s[:H,:W].reshape(H//2,2,W//2,2,4)
      uni=(q.max(axis=(1,3))==q.min(axis=(1,3))).all(-1).mean()
      if best is None or uni>best[0]: best=(uni,oy,ox)
  _,oy,ox=best
  s=a[oy:,ox:]; H=(s.shape[0]//2)*2; W=(s.shape[1]//2)*2
  return s[:H:2,:W:2].copy(),oy,ox
def _hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
# The body's rose-brown ramp, darkest to lightest (its vines and flesh), the creams of its horns and teeth, and the
# colours it uses most (for anything else on the hands).
SKIN_RAMP=[_hx(h) for h in ['#120e0f','#201216','#2b1c1e','#3a2a2e','#4f3d40','#624d4f','#7d6769','#947c7f']]  # a shade or two darker than the wings, so the hands read in front of them
BONE=[_hx(h) for h in ['#8e8475','#aca492','#d2cebc','#edebdb']]
BODY_PAL=[_hx(h) for h in ['#120e0f','#190e0f','#201216','#2b1c1e','#362628','#463035','#4f3d40','#624d4f','#7d6769','#4c0709','#831110','#ac2920','#38080a']]
import colorsys
def _lum(c): return (0.299*c[0]+0.587*c[1]+0.114*c[2])/255
def smooth_hand(img):
  a=np.array(img)
  lo,oy,ox=_native(a)
  hi=scale2x(lo)                       # same size again, edges and diagonals stepped one pixel at a time
  out=np.zeros_like(a); out[oy:oy+hi.shape[0],ox:ox+hi.shape[1]]=hi[:a.shape[0]-oy,:a.shape[1]-ox]
  # Stray specks (3 pixels or fewer, off on their own) go.
  al=out[:,:,3]>0
  seen=np.zeros_like(al); H_,W_=al.shape
  for y0 in range(H_):
    for x0 in range(W_):
      if not al[y0,x0] or seen[y0,x0]: continue
      stack=[(y0,x0)]; comp=[]; seen[y0,x0]=True
      while stack:
        y,x=stack.pop(); comp.append((y,x))
        for dy in (-1,0,1):
          for dx in (-1,0,1):
            yy,xx=y+dy,x+dx
            if 0<=yy<H_ and 0<=xx<W_ and al[yy,xx] and not seen[yy,xx]: seen[yy,xx]=True; stack.append((yy,xx))
      if len(comp)<=3:
        for y,x in comp: out[y,x]=0
  al=out[:,:,3]>0
  # Colours: the hands join the body's palette. Their skin (pale blue, green) takes the body's rose-brown ramp, shade
  # for shade (darkest to lightest kept in order); bone stays cream, as the horns and teeth; the rest snaps to the
  # nearest colour the body itself uses.
  rgb=out[:,:,:3].astype(float)
  hsv=np.array([colorsys.rgb_to_hsv(*(c/255)) for c in rgb.reshape(-1,3)]).reshape(rgb.shape)
  L=(0.299*rgb[...,0]+0.587*rgb[...,1]+0.114*rgb[...,2])/255
  skin=al&(hsv[...,1]>0.08)&(((hsv[...,0]>0.15)&(hsv[...,0]<0.75)))
  bone=al&~skin&(hsv[...,1]<0.25)&(L>0.45)
  if skin.any():
    lo,hi=np.percentile(L[skin],3),np.percentile(L[skin],97)
    t=np.clip((L-lo)/max(1e-3,hi-lo),0,1)
    idx=np.clip((t*(len(SKIN_RAMP)-1)).round().astype(int),0,len(SKIN_RAMP)-1)
    rgb[skin]=np.array(SKIN_RAMP,float)[idx[skin]]
  def snap(mask,pal):
    pal=np.array(pal,float); px=rgb[mask]
    d=((px[:,None,:]-pal[None,:,:])**2).sum(-1); rgb[mask]=pal[d.argmin(1)]
  snap(bone,BONE)
  snap(al&~skin&~bone,BODY_PAL)
  out[:,:,:3]=np.where(al[...,None],rgb.round().astype(np.uint8),out[:,:,:3])
  # Outline: a one-pixel edge in the body's outline colour.
  pad=np.pad(al,1)
  edge=al&~(pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:])
  out[edge]=(*OUTLINE,255)
  return Image.fromarray(out)
# keep only the part's own pixels (the biggest connected blob and anything near it is fine for these crops)
def scale2x(a):
  H,W=a.shape[:2]; o=np.zeros((H*2,W*2,4),a.dtype)
  pad=np.pad(a,((1,1),(1,1),(0,0)),mode='edge')
  P_=pad[1:-1,1:-1]; A=pad[:-2,1:-1]; B=pad[1:-1,2:]; C=pad[1:-1,:-2]; D=pad[2:,1:-1]
  eq=lambda u,v:(u==v).all(-1)
  e0=np.where((eq(C,A)&~eq(C,D)&~eq(A,B))[...,None],A,P_); e1=np.where((eq(A,B)&~eq(A,C)&~eq(B,D))[...,None],B,P_)
  e2=np.where((eq(D,C)&~eq(D,B)&~eq(C,A))[...,None],C,P_); e3=np.where((eq(B,D)&~eq(B,A)&~eq(D,C))[...,None],D,P_)
  o[0::2,0::2]=e0;o[0::2,1::2]=e1;o[1::2,0::2]=e2;o[1::2,1::2]=e3; return o
for _k in ('handL','handR'): CROPS[_k]=smooth_hand(CROPS[_k])
# The staff, a good deal bigger in its hand: doubled with Scale2x (its edges and diagonals stay one pixel steps).
STAFF_SCALE=2
_sb=P['staff']['box']; _sp=P['staff']['pivot']
_st=np.array(CROPS['staff'])
for _ in range(STAFF_SCALE//2): _st=scale2x(_st)
CROPS['staff']=Image.fromarray(_st)
P['staff']=dict(box=(0,0,_st.shape[1],_st.shape[0]),pivot=((_sp[0]-_sb[0])*STAFF_SCALE+STAFF_SCALE//2,(_sp[1]-_sb[1])*STAFF_SCALE+STAFF_SCALE//2),parent=('handR','grip'),joints={})
# ---- The Rift's wings (its c_Wing_monster), behind the body, split down the middle to flap from the shoulders. ----
import colorsys, os
WING_SRC=HERE+'/../../public/backgrounds/rift/c_Wing_monster.png'
WING_SCALE=2                    # the wings at the size they loom over the Rift, with the body 1.5x the old knight
WING_RECOLOUR=os.environ.get('WING_RECOLOUR','1')=='1'
def _wing_recolour(a):
  out=a.copy(); al=a[:,:,3]>0
  for y,x in zip(*np.where(al)):
    r,g,b=a[y,x,:3]/255; h,s_,v=colorsys.rgb_to_hsv(r,g,b)
    if 0.2<h<0.5 and s_>0.15:      # the green vines: the body's red vines
      h,s_,v=0.995,0.85,min(1,v*1.6)
    else:                           # the membrane and bones: from violet to the body's dark rose-brown
      h=0.98; s_=s_*0.75; v=v*0.82
    out[y,x,:3]=[round(c*255) for c in colorsys.hsv_to_rgb(h,s_,v)]
  return out
_w=Image.open(WING_SRC).convert('RGBA'); _w=_w.resize((_w.width*WING_SCALE,_w.height*WING_SCALE),Image.NEAREST)
_wa=np.array(_w)
if WING_RECOLOUR: _wa=_wing_recolour(_wa)
# The wing creature's own face (the middle, above the bones) would peek out pale beside the Time Eater's head: sink it
# into shadow, fading out toward the wings, so the wing roots read as one dark mass behind the body.
_yy,_xx=np.mgrid[0:_wa.shape[0],0:_wa.shape[1]]
_d=np.hypot((_xx-_wa.shape[1]/2)/(30*WING_SCALE),(_yy-40*WING_SCALE)/(52*WING_SCALE))
_k=np.clip(1.25-_d,0,1)[...,None]*0.8
_wa[...,:3]=(_wa[...,:3]*(1-_k)+np.array([32,18,22])*_k).round().astype(np.uint8)
_mid=_wa.shape[1]//2; _sh=44*WING_SCALE   # the wings' shoulders: the middle, near the top
CROPS['wingL']=Image.fromarray(_wa[:,:_mid].copy()); CROPS['wingR']=Image.fromarray(_wa[:,_mid:].copy())
P['wingL']=dict(box=(0,0,_mid,_wa.shape[0]),pivot=(_mid,_sh),parent=('torso','wing'),joints={})
P['wingR']=dict(box=(0,0,_wa.shape[1]-_mid,_wa.shape[0]),pivot=(0,_sh),parent=('torso','wing'),joints={})
def rot_part(img,deg,piv):
  """RotSprite-ish: Scale2x x3, rotate about the pivot with nearest, sample back down. Returns image + new pivot offset."""
  if abs(deg)<0.01: return img,piv
  a=np.array(img)
  for _ in range(3): a=scale2x(a)
  big=Image.fromarray(a)
  W,H=big.size; px,py=piv[0]*8+4,piv[1]*8+4
  # pad so rotation about pivot keeps everything
  R=int(math.hypot(max(px,W-px),max(py,H-py)))+8
  canvas=Image.new('RGBA',(2*R,2*R)); canvas.paste(big,(R-int(px),R-int(py)))
  r=canvas.rotate(deg,resample=Image.NEAREST,center=(R,R))
  arr=np.array(r)[4::8,4::8]
  out=Image.fromarray(arr); return out,(R/8-0.5,R/8-0.5)
def rotpt(p,deg):
  t=math.radians(-deg); return (p[0]*math.cos(t)-p[1]*math.sin(t), p[0]*math.sin(t)+p[1]*math.cos(t))
ROOT=(440,560)
def render(pose,size=(880,800),root=ROOT):
  """pose: {part: angle (deg, ccw positive, relative to parent), 'dx','dy'}"""
  world={}  # part -> (angle_total, pivot_world)
  canvas=Image.new('RGBA',size)
  def place(k):
    if k in world: return world[k]
    v=P[k]; a=pose.get(k,0)
    if 'parent' not in v:
      pw=(root[0]+pose.get('dx',0),root[1]+pose.get('dy',0)); tot=a
    else:
      pk,j=v['parent']; pa,ppw=place(pk); pv=P[pk]
      jl=(pv['joints'][j][0]-pv['pivot'][0], pv['joints'][j][1]-pv['pivot'][1])
      jr=rotpt(jl,pa); pw=(ppw[0]+jr[0],ppw[1]+jr[1]); tot=pa+a
    world[k]=(tot,pw); return world[k]
  for k in P: place(k)
  staff_img=None; staff_at=(0,0)
  for k in ORDER:
    if k=='staff' and pose.get('no_staff'): continue
    if k in ('wingL','wingR') and pose.get('no_wings'): continue
    v=P[k]; tot,pw=world[k]
    piv=(v['pivot'][0]-v['box'][0], v['pivot'][1]-v['box'][1])
    img,np_=rot_part(CROPS[k],tot,piv)
    at=(int(round(pw[0]-np_[0])),int(round(pw[1]-np_[1])))
    canvas.alpha_composite(img,at)
    if k=='staff': staff_img,staff_at=img,at
  if staff_img is None: return canvas
  if pose.get('staff_front'):
    # Mid-swing the staff comes round in front of the body: all of it on top.
    canvas.alpha_composite(staff_img,staff_at)
    return canvas
  # The staff runs behind the body, but over the hand that holds it: redraw its stretch around the grip on top.
  ga,gw=world['handR']; hv=P['handR']
  gl=(hv['joints']['grip'][0]-hv['pivot'][0], hv['joints']['grip'][1]-hv['pivot'][1]); gr=rotpt(gl,ga)
  gx,gy=gw[0]+gr[0],gw[1]+gr[1]
  sa=np.array(staff_img); H,W=sa.shape[:2]
  yy,xx=np.mgrid[0:H,0:W]
  near=np.hypot(xx+staff_at[0]-gx, yy+staff_at[1]-gy)<=GRIP_R
  sa[~near]=0
  canvas.alpha_composite(Image.fromarray(sa),staff_at)
  return canvas
if __name__=='__main__':
  import sys
  c=render({})
  bg=Image.new('RGBA',c.size,(122,116,136,255)); bg.alpha_composite(c); bg.save(sys.argv[1])
