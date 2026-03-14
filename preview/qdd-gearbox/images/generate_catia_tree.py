"""Generate CATIA assembly tree diagram for QDD gearbox portfolio page."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# --- Config ---
SCALE = 2
TARGET_W = 820
# Height calculated after layout

def s(val):
    return int(val * SCALE)

# Colors (dark bg matching .tree-block)
BG = (26, 26, 26)           # #1a1a1a
CARD_BG = (30, 30, 30)      # slightly lighter for subtle depth
GREEN_ACCENT = (138, 173, 126)  # #8aad7e
GREEN_DIM = (74, 103, 65)       # #4a6741
TEXT = (204, 204, 204)          # #cccccc
TEXT_DIM = (102, 102, 102)      # #666666
BORDER = (51, 51, 51)          # #333333
CONNECTOR = (80, 80, 80)       # connector lines (slightly brighter)
ICON_ASSEMBLY = (93, 125, 83)  # #5d7d53 for assembly folder icons
ICON_PART = (85, 85, 85)       # for part icons

# Fonts
FONT_MONO = "C:/Windows/Fonts/consola.ttf"
FONT_SANS = "C:/Windows/Fonts/segoeui.ttf"
FONT_SANS_BOLD = "C:/Windows/Fonts/segoeuib.ttf"

# Font sizes (pre-scale)
SIZE_TITLE = 15
SIZE_NODE = 14
SIZE_ANNOTATION = 11
SIZE_BADGE = 10

# Layout
PADDING_X = 28
PADDING_TOP = 24
PADDING_BOTTOM = 20
ROW_HEIGHT = 30
INDENT_STEP = 28
ICON_SIZE = 12
ICON_GAP = 8
CONNECTOR_X_OFFSET = 6  # where connector lines run (center of icon column)

# Tree data: (indent_level, name, annotation, is_assembly)
TREE = [
    (0, "QDD Master Assembly", "", True),
    (1, "Gearbox_Master_Assem", "", True),
    (2, "SKL_Skeleton", "master reference, FIXED", False),
    (2, "gear_set", "sun, planets, ring — placeholder + STEP", True),
    (2, "carrier_assem", "bottom/top, cutting_bodies", True),
    (2, "housing_assem", "body, lid, cutting_bodies", True),
    (2, "Bearings", "6805-2RS ×2", False),
    (1, "MotorHousing", "D6374 motor, enclosure", True),
    (1, "Engineering Connections", "", False),
]

# Precompute which rows are the LAST child at each indent level
def compute_last_child_flags(tree):
    """For each row, determine if it's the last sibling at its indent level."""
    flags = [False] * len(tree)
    for i in range(len(tree)):
        level = tree[i][0]
        if level == 0:
            continue
        # Check if there's any later sibling at the same level under the same parent
        is_last = True
        for j in range(i + 1, len(tree)):
            if tree[j][0] < level:
                break  # went up to parent or higher — we were last
            if tree[j][0] == level:
                is_last = False
                break
        flags[i] = is_last
    return flags

LAST_FLAGS = compute_last_child_flags(TREE)

# Compute which indent levels have continuing lines at each row
def compute_continuing_lines(tree, last_flags):
    """For each row, return set of indent levels that have a vertical line passing through."""
    # Track which levels still have children coming
    active_levels = set()
    result = []
    for i in range(len(tree)):
        level = tree[i][0]
        # Remove levels >= current (they ended or we're replacing)
        active_levels = {l for l in active_levels if l < level}
        # This row's level is active unless it's the last child
        if not last_flags[i] and level > 0:
            active_levels.add(level)
        result.append(set(active_levels))
    return result

CONTINUING = compute_continuing_lines(TREE, LAST_FLAGS)

# Calculate canvas height
num_rows = len(TREE)
content_height = PADDING_TOP + num_rows * ROW_HEIGHT + PADDING_BOTTOM + 8
TARGET_H = content_height

# Create canvas
img = Image.new("RGB", (s(TARGET_W), s(TARGET_H)), BG)
draw = ImageDraw.Draw(img)

# Load fonts
font_mono = ImageFont.truetype(FONT_MONO, s(SIZE_NODE))
font_mono_title = ImageFont.truetype(FONT_SANS_BOLD, s(SIZE_TITLE))
font_annotation = ImageFont.truetype(FONT_SANS, s(SIZE_ANNOTATION))
font_badge = ImageFont.truetype(FONT_SANS_BOLD, s(SIZE_BADGE))

# Draw rounded rect background with top accent bar
corner_r = s(12)

# Create a mask for the rounded rect to clip the accent bar
mask = Image.new("L", img.size, 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle(
    (s(2), s(2), s(TARGET_W - 2), s(TARGET_H - 2)),
    radius=corner_r,
    fill=255,
)

# Draw accent bar on a separate layer, composite with mask
accent_layer = Image.new("RGB", img.size, BG)
accent_draw = ImageDraw.Draw(accent_layer)
accent_draw.rectangle(
    (0, 0, s(TARGET_W), s(4)),
    fill=GREEN_DIM,
)
img.paste(accent_layer, mask=mask)
draw = ImageDraw.Draw(img)  # refresh draw object

# Draw border
draw.rounded_rectangle(
    (s(1), s(1), s(TARGET_W - 1), s(TARGET_H - 1)),
    radius=corner_r,
    fill=None,
    outline=BORDER,
    width=s(1)
)

def draw_assembly_icon(draw, cx, cy, size, filled=True):
    """Draw a small folder-like icon for assemblies."""
    half = s(size) // 2
    x0 = cx - half
    y0 = cy - half
    x1 = cx + half
    y1 = cy + half

    if filled:
        # Folder icon: rectangle with a tab
        tab_w = s(size) * 2 // 3
        tab_h = s(size) // 4
        # Tab on top-left
        draw.rectangle((x0, y0 - tab_h, x0 + tab_w, y0), fill=ICON_ASSEMBLY)
        # Main body
        draw.rectangle((x0, y0, x1, y1), fill=ICON_ASSEMBLY)
    else:
        # Part icon: small diamond/circle
        r = s(size) // 3
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ICON_PART, outline=TEXT_DIM)

def get_row_y(row_idx):
    """Get the vertical center of a row."""
    return PADDING_TOP + 12 + row_idx * ROW_HEIGHT

def get_indent_x(level):
    """Get the x position for a given indent level's connector line."""
    return PADDING_X + level * INDENT_STEP

# Draw connector lines first (behind everything)
for i, (level, name, annotation, is_asm) in enumerate(TREE):
    if level == 0:
        continue

    y_center = s(get_row_y(i))
    x_connector = s(get_indent_x(level) - INDENT_STEP + CONNECTOR_X_OFFSET)
    x_branch_end = s(get_indent_x(level) - 4)

    # Horizontal branch line to this node
    draw.line(
        [(x_connector, y_center), (x_branch_end, y_center)],
        fill=CONNECTOR, width=s(1)
    )

    # Vertical line from parent down to this row
    # Find the row above at the same indent level or the parent
    if LAST_FLAGS[i]:
        # └── style: vertical line from previous sibling or parent down to here
        # Find where the vertical line starts
        y_start = None
        for j in range(i - 1, -1, -1):
            if TREE[j][0] < level:
                y_start = s(get_row_y(j))
                break
            if TREE[j][0] == level:
                y_start = s(get_row_y(j))
                break
        if y_start is not None:
            draw.line(
                [(x_connector, y_start), (x_connector, y_center)],
                fill=CONNECTOR, width=s(1)
            )
    else:
        # ├── style: vertical line continues past this row
        y_start = None
        for j in range(i - 1, -1, -1):
            if TREE[j][0] < level:
                y_start = s(get_row_y(j))
                break
            if TREE[j][0] == level:
                y_start = s(get_row_y(j))
                break
        if y_start is not None:
            # Draw down to current row (will extend further in next iterations)
            draw.line(
                [(x_connector, y_start), (x_connector, y_center)],
                fill=CONNECTOR, width=s(1)
            )

# Now handle continuing vertical lines that pass through rows
for i in range(len(TREE)):
    y_center = s(get_row_y(i))
    for cont_level in CONTINUING[i]:
        x_connector = s(get_indent_x(cont_level) - INDENT_STEP + CONNECTOR_X_OFFSET)
        # Extend line down to next row
        if i + 1 < len(TREE):
            y_next = s(get_row_y(i + 1))
            draw.line(
                [(x_connector, y_center), (x_connector, y_next)],
                fill=CONNECTOR, width=s(1)
            )

# Draw nodes (icons + text)
for i, (level, name, annotation, is_asm) in enumerate(TREE):
    y_center = s(get_row_y(i))
    x_icon = s(get_indent_x(level) + ICON_SIZE // 2)

    # Draw icon
    draw_assembly_icon(draw, x_icon, y_center, ICON_SIZE, filled=is_asm)

    # Draw name
    x_text = x_icon + s(ICON_SIZE // 2 + ICON_GAP)

    if level == 0:
        # Root node — bold, brighter
        draw.text((x_text, y_center), name, font=font_mono_title, fill=GREEN_ACCENT, anchor="lm")
    else:
        # Regular node
        name_color = GREEN_ACCENT if is_asm else TEXT
        draw.text((x_text, y_center), name, font=font_mono, fill=name_color, anchor="lm")

    # Draw annotation
    if annotation:
        # Get name width to position annotation after it
        bbox = draw.textbbox((0, 0), name, font=font_mono if level > 0 else font_mono_title)
        name_w = bbox[2] - bbox[0]
        x_annot = x_text + name_w + s(12)
        annot_text = f"({annotation})"
        draw.text((x_annot, y_center), annot_text, font=font_annotation, fill=TEXT_DIM, anchor="lm")

# Downscale
final = img.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

output_path = "C:/Users/aaron/Documents/c-projects/Portfolio/Website/src/qdd-gearbox/images/catia-tree-diagram.png"
final.save(output_path, quality=95)
print(f"Saved to {output_path}")
print(f"Size: {TARGET_W}x{TARGET_H}")
