import json
from pathlib import Path

import numpy as np
from PIL import Image

import prepare_food

ROOT = Path(__file__).resolve().parents[2]
FOOD = ROOT / "assets" / "food"


def test_food_json_matches_the_tool_and_every_picture_lines_up():
    data = json.loads((FOOD / "food.json").read_text(encoding="utf-8"))
    assert data["pxPerUnit"] == prepare_food.PX
    assert [i["id"] for i in data["items"]] == list(prepare_food.ITEMS)
    for item in data["items"]:
        spec = prepare_food.ITEMS[item["id"]]
        assert tuple(item["size"]) == spec.size and item["height"] == spec.height
        colour, level = Image.open(ROOT / item["texture"]), Image.open(ROOT / item["relief"])
        assert colour.size == level.size == (spec.size[0] * data["pxPerUnit"], spec.size[1] * data["pxPerUnit"])


def test_every_item_is_cut_out():
    for path in FOOD.glob("*.webp"):
        if path.stem.endswith("-relief"):
            continue
        alpha = np.asarray(Image.open(path).getchannel("A"))
        share = (alpha > 127).mean()
        # the sushi tray fills its footprint but for its rounded corners (98.5 %)
        assert alpha.min() == 0 and 0.35 < share < 0.99, f"{path.name}: {share:.3f} opaque"


def test_the_brands_are_gone():
    data = json.loads((FOOD / "food.json").read_text(encoding="utf-8"))
    items = {i["id"]: i for i in data["items"]}
    assert items["fries"]["cleaned"] and items["strawberries"]["cleaned"]
    for item in items.values():
        rgb = np.asarray(Image.open(ROOT / item["texture"]).convert("RGB"), float)
        for x0, y0, x1, y1 in item["cleaned"]:
            r, g, b = np.moveaxis(rgb[y0:y1, x0:x1], 2, 0)
            yellow = ((r > 170) & (g > 130) & (b < 110) & (r - b > 90)).mean()  # the "M"
            assert yellow < 0.01, f"{item['id']}: {yellow:.3f} yellow"
            if item["id"] == "strawberries":  # a blank paper label: no dark print left (the fries' red would count as dark)
                assert ((0.299 * r + 0.587 * g + 0.114 * b) < 90).mean() < 0.01
