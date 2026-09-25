"""Generate the simple vector-like book mark used by Expo."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
SIZE = 2048
NAVY = "#121820"
CORAL = "#EE6B4D"
PAPER = "#F7F5F0"


def mark(background: bool) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), NAVY if background else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Two readable page shapes and a strong spine make the mark legible at tab size.
    draw.rounded_rectangle((330, 430, 1010, 1540), radius=90, fill=CORAL)
    draw.rounded_rectangle((1038, 430, 1718, 1540), radius=90, fill=PAPER)
    draw.polygon([(985, 480), (1063, 480), (1063, 1590), (985, 1590)], fill=NAVY)
    for y in (750, 910, 1070):
        draw.rounded_rectangle((490, y, 840, y + 32), radius=16, fill=NAVY)
        draw.rounded_rectangle((1208, y, 1558, y + 32), radius=16, fill=NAVY)
    return image


mark(True).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS).save(ASSETS / "icon.png")
mark(False).resize((1024, 1024), Image.Resampling.LANCZOS).save(ASSETS / "adaptive-icon.png")
mark(False).resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "splash-icon.png")
mark(True).convert("RGB").resize((64, 64), Image.Resampling.LANCZOS).save(ASSETS / "favicon.png")
