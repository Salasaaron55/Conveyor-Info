import json
import os

CATALOG = 'docs/data/parts-catalog.json'
THUMBS  = 'docs/static/parts-thumbnails'

with open(CATALOG) as f:
    catalog = json.load(f)

added, missing = [], []

for filename in os.listdir(THUMBS):
    if filename == 'placeholder.svg':
        continue
    part_num, ext = os.path.splitext(filename)
    if not ext.lower() in ('.png', '.jpg', '.jpeg', '.webp', '.svg'):
        continue
    if part_num in catalog:
        if catalog[part_num].get('image') != filename:
            catalog[part_num]['image'] = filename
            added.append(part_num)
    else:
        missing.append(part_num)

with open(CATALOG, 'w') as f:
    json.dump(catalog, f, indent=2)

if added:
    print(f'Updated {len(added)} part(s): {", ".join(added)}')
else:
    print('No new images to link.')

if missing:
    print(f'WARNING — no catalog entry for: {", ".join(missing)}')
