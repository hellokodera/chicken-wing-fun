from PIL import Image
from collections import deque

SRC = 'raw-assets/ui/play_again.png'
OUTS = ['assets/images/ui/play_again_tub.png', 'raw-assets/ui/play_again_tub.png']
DEBUG_OUT = 'raw-assets/ui/play_again_tub_debug.png'
MATTE = (255, 61, 174)  # hot pink: grey / green / black-halo fringe pops against it

SEEDS = [(690, 520), (700, 690), (980, 690), (400, 690), (665, 335), (705, 345)]

im = Image.open(SRC).convert('RGBA')
W, H = im.size
s = im.load()
orig = [[s[x, y] for x in range(W)] for y in range(H)]


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def dark(c):
    return lum(c) < 112


def green(c):
    r, g, b = c[0], c[1], c[2]
    return g > r + 7 and g > b + 5 and lum(c) < 236


NB = ((1, 0), (-1, 0), (0, 1), (0, -1))
NB8 = NB + ((1, 1), (1, -1), (-1, 1), (-1, -1))

alpha = [[255] * W for _ in range(H)]

# 1. colour-cut the green tile wall + floor
for y in range(H):
    for x in range(W):
        if green(orig[y][x]):
            alpha[y][x] = 0

# 2. mark long, thin, near-full-width horizontal DARK runs (grout / trim lines)
#    as flood-passable so ONLY the bold tub outline acts as a barrier.
is_dark = [[dark(orig[y][x]) for x in range(W)] for y in range(H)]
passable = [[False] * W for _ in range(H)]
for y in range(H):
    x = 0
    while x < W:
        if not is_dark[y][x]:
            x += 1
            continue
        x0 = x
        while x < W and is_dark[y][x]:
            x += 1
        rlen = x - x0
        if rlen >= 250 and (x0 < 120 or x > W - 120):
            thin = True
            for sx in range(x0, x, max(1, rlen // 10)):
                t = 1
                yy = y - 1
                while yy >= 0 and is_dark[yy][sx]:
                    t += 1
                    yy -= 1
                yy = y + 1
                while yy < H and is_dark[yy][sx]:
                    t += 1
                    yy += 1
                if t > 4:
                    thin = False
                    break
            if thin:
                for xx in range(x0, x):
                    passable[y][xx] = True

# 3. barrier = bold outline (dark and not a stripped run), dilated 1px to seal
#    anti-aliased leaks without over-thickening thin outline (the faucet neck).
block = [[is_dark[y][x] and not passable[y][x] for x in range(W)] for y in range(H)]
for _ in range(1):
    add = [(x, y) for y in range(H) for x in range(W)
           if not block[y][x]
           and any(0 <= x + dx < W and 0 <= y + dy < H and block[y + dy][x + dx] for dx, dy in NB8)]
    for x, y in add:
        block[y][x] = True

# 4. flood inward from the true canvas edges; stop dead at the barrier
seen = [[False] * W for _ in range(H)]
q = deque()


def seed_edge(x, y):
    if 0 <= x < W and 0 <= y < H and not seen[y][x] and not block[y][x] and alpha[y][x]:
        seen[y][x] = True
        q.append((x, y))


for x in range(W):
    seed_edge(x, 0)
    seed_edge(x, H - 1)
for y in range(H):
    seed_edge(0, y)
    seed_edge(W - 1, y)
while q:
    x, y = q.popleft()
    alpha[y][x] = 0
    for dx, dy in NB:
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and not block[ny][nx] and alpha[ny][nx]:
            seen[ny][nx] = True
            q.append((nx, ny))

# 5. edge-line peel: no opaque pixel may sit on a straight opaque path to the
#    frame edge (insurance vs. a residual bridging line)
for y in range(H):
    x = 0
    while x < W and alpha[y][x]:
        alpha[y][x] = 0
        x += 1
    x = W - 1
    while x >= 0 and alpha[y][x]:
        alpha[y][x] = 0
        x -= 1
for x in range(W):
    y = 0
    while y < H and alpha[y][x]:
        alpha[y][x] = 0
        y += 1
    y = H - 1
    while y >= 0 and alpha[y][x]:
        alpha[y][x] = 0
        y -= 1

# 6. keep every blob a tub-content seed lands in (belly / feet / faucet body)
keepset = set()
for sx, sy in SEEDS:
    if alpha[sy][sx] == 0 or (sx, sy) in keepset:
        continue
    dq = deque([(sx, sy)])
    keepset.add((sx, sy))
    while dq:
        x, y = dq.popleft()
        for dx, dy in NB8:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in keepset and alpha[ny][nx]:
                keepset.add((nx, ny))
                dq.append((nx, ny))
for y in range(H):
    for x in range(W):
        if alpha[y][x] and (x, y) not in keepset:
            alpha[y][x] = 0

# 7. restore enclosed transparent (green letters / faucet interior) from origin
outside = [[False] * W for _ in range(H)]
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if alpha[y][x] == 0 and not outside[y][x]:
            outside[y][x] = True
            dq.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if alpha[y][x] == 0 and not outside[y][x]:
            outside[y][x] = True
            dq.append((x, y))
while dq:
    x, y = dq.popleft()
    for dx, dy in NB:
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not outside[ny][nx] and alpha[ny][nx] == 0:
            outside[ny][nx] = True
            dq.append((nx, ny))
for y in range(H):
    for x in range(W):
        if alpha[y][x] == 0 and not outside[y][x]:
            alpha[y][x] = 255

# 8a. green fringe ring cleanup (pure tile colour, safe)
for _ in range(8):
    peel = [(x, y) for y in range(H) for x in range(W)
            if alpha[y][x] and green(orig[y][x])
            and any(not (0 <= x + dx < W and 0 <= y + dy < H) or alpha[y + dy][x + dx] == 0 for dx, dy in NB8)]
    if not peel:
        break
    for x, y in peel:
        alpha[y][x] = 0

# 8b. peel unsupported crumbs (<= 2 opaque neighbours)
for _ in range(2):
    peel = [(x, y) for y in range(H) for x in range(W)
            if alpha[y][x]
            and sum(1 for dx, dy in NB8 if 0 <= x + dx < W and 0 <= y + dy < H and alpha[y + dy][x + dx]) <= 2]
    if not peel:
        break
    for x, y in peel:
        alpha[y][x] = 0

# 8c. DE-FRINGE. The kept region carries a thin ring of anti-aliased blend
#     pixels (grey / green muck) just outside the true black outline - that is
#     the blurry edge. Erode 1px to shave it back to the crisp outline - but
#     never erode a true-black core pixel, so a thin outline (the gooseneck
#     wall) can't be pinched open. Then drop leftover thin spurs.
def core_black(c):
    return lum(c) < 64


for _ in range(1):
    rem = [(x, y) for y in range(H) for x in range(W)
           if alpha[y][x] and not core_black(orig[y][x])
           and any(not (0 <= x + dx < W and 0 <= y + dy < H) or alpha[y + dy][x + dx] == 0 for dx, dy in NB)]
    for x, y in rem:
        alpha[y][x] = 0
for _ in range(2):
    peel = [(x, y) for y in range(H) for x in range(W)
            if alpha[y][x] and not core_black(orig[y][x])
            and sum(1 for dx, dy in NB8 if 0 <= x + dx < W and 0 <= y + dy < H and alpha[y + dy][x + dx]) <= 2]
    if not peel:
        break
    for x, y in peel:
        alpha[y][x] = 0

# 8c-weld. Close pinholes / nicks / thin slices INSIDE the shape: a transparent
#     pixel that is flanked by opaque on opposite sides (within 3px) and whose
#     source colour is genuine tub material - outline-dark OR desaturated chrome
#     grey - is an internal gap; fill it back with its real colour. The
#     "flanked on opposite sides" test means background can never qualify (it is
#     not enclosed), so this only ever repairs the tub / faucet / outline.
def chrome(c):
    return (max(c[:3]) - min(c[:3])) < 26 and 80 < lum(c) < 238


for _ in range(3):
    weld = []
    for y in range(H):
        for x in range(W):
            if alpha[y][x]:
                continue
            c = orig[y][x]
            if not (dark(c) or chrome(c)):
                continue
            left = any(0 <= x - k < W and alpha[y][x - k] for k in (1, 2))
            right = any(0 <= x + k < W and alpha[y][x + k] for k in (1, 2))
            up = any(0 <= y - k < H and alpha[y - k][x] for k in (1, 2))
            down = any(0 <= y + k < H and alpha[y + k][x] for k in (1, 2))
            if (left and right) or (up and down):
                weld.append((x, y))
    if not weld:
        break
    for x, y in weld:
        alpha[y][x] = 255

# 8d. hard alpha snap - guarantee nothing between 0 and 255 survives
for y in range(H):
    for x in range(W):
        alpha[y][x] = 255 if alpha[y][x] >= 128 else 0

# 9. compose + tight crop
full = Image.new('RGBA', (W, H))
fp = full.load()
minx, miny, maxx, maxy = W, H, 0, 0
kept = 0
for y in range(H):
    for x in range(W):
        if alpha[y][x]:
            r, g, b, _ = orig[y][x]
            fp[x, y] = (r, g, b, 255)
            kept += 1
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)
pad = 3
box = (max(0, minx - pad), max(0, miny - pad), min(W, maxx + 1 + pad), min(H, maxy + 1 + pad))
crop = full.crop(box)
for p in OUTS:
    crop.save(p)

# debug composite over an opaque matte so any residual fringe is obvious
dbg = Image.new('RGB', crop.size, MATTE)
dbg.paste(crop, (0, 0), crop)
dbg.save(DEBUG_OUT)

cw, ch = crop.size
ca = crop.getchannel('A').histogram()
print('final alpha values present:', [(i, c) for i, c in enumerate(ca) if c])
bg = 0
for y in range(ch):
    for x in range(cw):
        r, g, b, a = crop.getpixel((x, y))
        if a and g > r + 7 and g > b + 5 and (0.299 * r + 0.587 * g + 0.114 * b) < 236:
            if y < ch * 0.4 or x < cw * 0.07 or x > cw * 0.93:
                bg += 1
print('kept', kept, 'px   crop', crop.size, '  suspicious-bg-green(edges/top)', bg)
print('debug composite ->', DEBUG_OUT)
