"""Reads original Deflektor (C64) level screenshots from levels.png into tile/quadrant feature dumps.

levels.png is a 5-column sheet of 320x200 C64 screens; the 15x9 playfield of 16px tiles starts at (40, 24).
"""
import sys
from collections import Counter
from PIL import Image

SHEET = Image.open('levels.png').convert('RGB')
ORIGIN_X, ORIGIN_Y = 40, 24
COLS, ROWS, TILE = 15, 9, 16

COLOR_NAMES = {
    (4, 2, 4): 'k', (84, 86, 84): 'g', (132, 130, 132): 'G', (172, 170, 172): 'L',
    (140, 66, 52): 'r', (188, 118, 108): 'p', (60, 50, 164): 'b', (124, 114, 220): 'B',
    (140, 70, 172): 'v', (124, 190, 196): 'c', (212, 222, 116): 'y', (92, 70, 4): 'n',
    (148, 94, 36): 'o', (108, 170, 68): 'e', (252, 254, 252): 'w',
}


def tile_image(level, tx, ty):
    index = level - 1
    x = (index % 5) * 320 + ORIGIN_X + tx * TILE
    y = (index // 5) * 200 + ORIGIN_Y + ty * TILE
    return SHEET.crop((x, y, x + TILE, y + TILE))


def tile_codes(level, tx, ty):
    image = tile_image(level, tx, ty)
    return [[COLOR_NAMES.get(image.getpixel((x, y)), '?') for x in range(TILE)] for y in range(TILE)]




# ---------------------------------------------------------------- classification

from collections import Counter  # noqa: E402

MIRROR_PROTOTYPES = [(1, 2, 5), (5, 4, 0), (1, 2, 2), (2, 6, 4), (1, 8, 8), (5, 9, 3), (3, 11, 4), (5, 11, 1),
                     (3, 3, 8), (1, 8, 0), (2, 4, 6), (2, 8, 1), (1, 14, 3), (1, 0, 0), (2, 14, 7), (2, 0, 0)]
"""Clean C64 mirror sprites in order: index k = plate at k * 11.25 degrees clockwise from horizontal."""


def flat(codes):
    return ''.join(''.join(row) for row in codes)


MIRROR_SPRITES = [flat(tile_codes(*where)) for where in MIRROR_PROTOTYPES]


def counts(codes):
    return Counter(ch for row in codes for ch in row)


def is_mirror(codes):
    frame = sum(codes[y][15] == 'G' for y in range(16)) + sum(codes[15][x] == 'G' for x in range(16))
    return frame >= 20 and counts(codes)['g'] > 90


def mirror_rotation(codes):
    """Our engine's rotation m for the nearest C64 mirror sprite (horizontal plate is m = 8)."""
    pixels = flat(codes)
    distances = [sum(a != b for a, b in zip(pixels, sprite)) for sprite in MIRROR_SPRITES]
    return (distances.index(min(distances)) + 8) % 16


def edge_black(codes, side):
    middle = range(5, 11)
    if side == 'up':
        return sum(codes[y][x] == 'k' for y in range(3) for x in middle)
    if side == 'down':
        return sum(codes[y][x] == 'k' for y in range(13, 16) for x in middle)
    if side == 'left':
        return sum(codes[y][x] == 'k' for y in middle for x in range(3))
    return sum(codes[y][x] == 'k' for y in middle for x in range(13, 16))


def barrel_side(codes):
    """The emitter barrel is a light-blue bar sticking out of the body's middle."""
    def light(ys, xs):
        return sum(codes[y][x] in 'Bb' for y in ys for x in xs)
    sides = {
        'left': light(range(6, 10), range(0, 3)),
        'right': light(range(6, 10), range(13, 16)),
        'up': light(range(0, 3), range(6, 10)),
        'down': light(range(13, 16), range(6, 10)),
    }
    return max(sides, key=sides.get), sides


def stripe_axis(codes):
    """Polariser stripe direction as an engine axis: 0 = |, 2 = /, 4 = -, 6 = \\ (C64 pixels are 2 wide)."""
    def continuity(dx, dy):
        same = total = 0
        for y in range(16):
            for x in range(16):
                nx, ny = x + dx, y + dy
                if 0 <= nx < 16 and 0 <= ny < 16:
                    total += 1
                    same += codes[y][x] == codes[ny][nx]
        return same / total
    scores = {0: continuity(0, 2), 4: continuity(4, 0), 2: continuity(2, -1), 6: continuity(2, 1)}
    return max(scores, key=scores.get), scores


def quadrant_walls(codes):
    """Wall type per 8px quadrant: '#' absorbing purple brick, '=' reflecting light-blue brick, '.' none."""
    result = []
    for qy in range(2):
        row = ''
        for qx in range(2):
            quad = Counter(codes[y][x] for y in range(qy * 8, qy * 8 + 8) for x in range(qx * 8, qx * 8 + 8))
            if quad['v'] >= 12:
                row += '#'
            elif quad['c'] >= 12:
                row += '='
            else:
                row += '.'
        result.append(row)
    return result


MIRROR_MATCH_LIMIT = 100
"""Mirrors partly covered by the beam or cursor stay within ~60 differing pixels; cells are ~150 away."""


def mirror_distance(codes):
    pixels = flat(codes)
    return min(sum(a != b for a, b in zip(pixels, sprite)) for sprite in MIRROR_SPRITES)


def classify(codes):
    """Returns (kind, detail) for one playfield tile."""
    n = counts(codes)
    if is_mirror(codes) or mirror_distance(codes) < MIRROR_MATCH_LIMIT:
        return 'mirror', mirror_rotation(codes)
    if n['e'] >= 20:
        return 'fibre', None
    if n['o'] >= 6 and n['n'] >= 20:
        return 'mine', None
    if n['p'] >= 40:
        return 'refractor', None
    if n['b'] + n['B'] >= 90 and n['v'] < 10 and n['c'] < 10:
        return 'emitter', barrel_side(codes)
    if n['r'] >= 30 and n['y'] >= 15 and n['k'] >= 30:
        facing = max(('up', 'down', 'left', 'right'), key=lambda side: edge_black(codes, side))
        return 'receiver', facing
    if n['y'] + n['r'] >= 150:
        return 'polariser-yr', stripe_axis(codes)
    if n['L'] + n['n'] >= 150:
        return 'polariser-gn', stripe_axis(codes)
    if n['G'] >= 50 and n['g'] >= 30:
        return 'cell', None
    walls = quadrant_walls(codes)
    if any(ch != '.' for row in walls for ch in row):
        return 'walls', walls
    return 'empty', None


# ---------------------------------------------------------------- level assembly

SOLVABILITY_PATCHES = {
    # Our beam model can't reproduce the original's pixel-exact grazing everywhere. In these spots a single
    # brick right beside the target makes the level unfinishable, so it is removed (found by the solver).
    2: [(28, 3)],
    3: [(27, 13)],
    8: [(7, 2)],
}
"""Level -> quarter-tile bricks (qx, qy) to delete after extraction."""

RECEIVER_SPRITES = [flat(tile_codes(1, 3, 8)), flat(tile_codes(2, 14, 0))]
OBJECT_CHAR = {'cell': 'o', 'mine': 'x', 'refractor': '*', 'emitter': 'E', 'receiver': 'R'}
POLARISER_CHAR = {'polariser-yr': 'p', 'polariser-gn': 'q'}


def mirrored_variants(sprite):
    rows = [sprite[i * 16:(i + 1) * 16] for i in range(16)]
    horizontal = ''.join(row[::-1] for row in rows)
    vertical = ''.join(rows[::-1])
    return [sprite, horizontal, vertical, ''.join(row[::-1] for row in rows[::-1])]


def receiver_distance(codes):
    pixels = flat(codes)
    return min(sum(a != b for a, b in zip(pixels, variant))
               for sprite in RECEIVER_SPRITES for variant in mirrored_variants(sprite))


def emitter_direction(codes):
    """The barrel side is the narrow one: its outer lines are mostly not emitter body."""
    def outside(ys, xs):
        return sum(codes[y][x] not in 'bB' for y in ys for x in xs)
    sides = {
        'left': outside(range(16), range(0, 4)),
        'right': outside(range(16), range(12, 16)),
        'up': outside(range(0, 4), range(16)),
        'down': outside(range(12, 16), range(16)),
    }
    return max(sides, key=sides.get)


def extract_level(level):
    tiles = [['.'] * COLS for _ in range(ROWS)]
    walls = [['.'] * (COLS * 2) for _ in range(ROWS * 2)]
    receivers, emitter = [], None
    for ty in range(ROWS):
        for tx in range(COLS):
            codes = tile_codes(level, tx, ty)
            kind, detail = classify(codes)
            if kind == 'mirror':
                tiles[ty][tx] = format(detail, 'x')
            elif kind == 'walls':
                for qy in range(2):
                    for qx in range(2):
                        walls[ty * 2 + qy][tx * 2 + qx] = detail[qy][qx]
            elif kind == 'receiver':
                receivers.append((receiver_distance(codes), tx, ty, codes))
            elif kind == 'emitter':
                emitter = emitter_direction(codes)
                tiles[ty][tx] = 'E'
            elif kind == 'fibre':
                tiles[ty][tx] = 'T'
            elif kind in POLARISER_CHAR:
                tiles[ty][tx] = POLARISER_CHAR[kind]
            elif kind in OBJECT_CHAR:
                tiles[ty][tx] = OBJECT_CHAR[kind]
    receivers.sort()
    _, receiver_x, receiver_y, _ = receivers[0]
    tiles[receiver_y][receiver_x] = 'R'
    for _, tx, ty, codes in receivers[1:]:
        # A second "receiver" is the cursor bracket drawn over a neighbouring tile.
        tiles[ty][tx] = 'o' if counts(codes)['G'] >= 30 else '.'
    mark_gates(walls, receiver_x, receiver_y)
    for qx, qy in SOLVABILITY_PATCHES.get(level, []):
        walls[qy][qx] = '.'
    return {
        'tiles': [''.join(row) for row in tiles],
        'walls': [''.join(row) for row in walls],
        'emitter': emitter,
    }


def mark_gates(walls, receiver_x, receiver_y):
    """Light-blue bricks in the tiles around the receiver are the obstacles that vanish once every cell is gone."""
    for dx, dy in ((dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx, dy) != (0, 0)):
        tx, ty = receiver_x + dx, receiver_y + dy
        if not (0 <= tx < COLS and 0 <= ty < ROWS):
            continue
        for qy in (ty * 2, ty * 2 + 1):
            for qx in (tx * 2, tx * 2 + 1):
                if walls[qy][qx] == '=':
                    walls[qy][qx] = '+'


def write_typescript(levels, path):
    lines = [
        '// Generated by scripts/extract_levels.py from levels.png (the original C64 levels). Do not edit by hand.',
        "import type { LevelDefinition } from './types';",
        '',
        'export const LEVELS: LevelDefinition[] = [',
    ]
    for number, level in levels:
        lines.append('  {')
        lines.append(f"    name: 'Level {number}',")
        lines.append(f"    emitter: '{level['emitter']}',")
        lines.append('    energySeconds: 150,')
        lines.append('    tiles: [')
        lines.extend(f"      '{row}'," for row in level['tiles'])
        lines.append('    ],')
        lines.append('    walls: [')
        lines.extend(f"      '{row}'," for row in level['walls'])
        lines.append('    ],')
        lines.append('  },')
    lines.append('];')
    with open(path, 'w') as handle:
        handle.write('\n'.join(lines) + '\n')


def render_check(level, extracted, path):
    """Original playfield (left) next to a schematic of what was extracted (right)."""
    from PIL import ImageDraw
    scale = 4
    index = level - 1
    x0 = (index % 5) * 320 + ORIGIN_X
    y0 = (index // 5) * 200 + ORIGIN_Y
    original = SHEET.crop((x0, y0, x0 + COLS * TILE, y0 + ROWS * TILE)).resize((COLS * TILE * scale, ROWS * TILE * scale), Image.NEAREST)
    width, height = original.size
    canvas = Image.new('RGB', (width * 2 + 20, height), (20, 10, 30))
    canvas.paste(original, (0, 0))
    draw = ImageDraw.Draw(canvas)
    ox = width + 20
    cell = TILE * scale
    quarter = cell // 2
    for qy, row in enumerate(extracted['walls']):
        for qx, ch in enumerate(row):
            if ch != '.':
                color = {'#': (150, 80, 190), '=': (120, 200, 210), '+': (255, 255, 255)}[ch]
                draw.rectangle((ox + qx * quarter + 2, qy * quarter + 2, ox + (qx + 1) * quarter - 3, (qy + 1) * quarter - 3), fill=color)
    colors = {'o': (140, 140, 140), 'x': (160, 110, 30), '*': (220, 130, 120), 'E': (80, 80, 230), 'R': (230, 80, 60),
              'T': (100, 200, 80), 'p': (230, 220, 100), 'q': (190, 190, 190)}
    for ty, row in enumerate(extracted['tiles']):
        for tx, ch in enumerate(row):
            if ch == '.':
                continue
            cx, cy = ox + tx * cell + cell // 2, ty * cell + cell // 2
            if ch in '0123456789abcdef':
                import math
                k = (int(ch, 16) + 8) % 16
                angle = math.radians(k * 11.25)
                dx, dy = math.cos(angle) * cell * 0.42, math.sin(angle) * cell * 0.42
                draw.rectangle((cx - cell // 2 + 3, cy - cell // 2 + 3, cx + cell // 2 - 3, cy + cell // 2 - 3), outline=(90, 90, 90))
                draw.line((cx - dx, cy - dy, cx + dx, cy + dy), fill=(240, 240, 120), width=6)
            else:
                draw.ellipse((cx - cell * 0.35, cy - cell * 0.35, cx + cell * 0.35, cy + cell * 0.35), fill=colors[ch])
                draw.text((cx - 4, cy - 6), ch, fill=(0, 0, 0))
                if ch == 'E':
                    dx, dy = {'left': (-1, 0), 'right': (1, 0), 'up': (0, -1), 'down': (0, 1)}[extracted['emitter']]
                    draw.line((cx, cy, cx + dx * cell * 0.7, cy + dy * cell * 0.7), fill=(255, 255, 255), width=5)
    canvas.save(path)


if __name__ == '__main__':
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    write_typescript([(number, extract_level(number)) for number in range(1, count + 1)], 'src/engine/levels.ts')
    print(f'Wrote {count} levels to src/engine/levels.ts')
