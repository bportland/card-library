"""Build stamp-prices.json: TCGplayer market prices for stamped cards.

TCGdex has no prices for stamped printings, and the app can't read tcgcsv.com
(a daily copy of TCGplayer's prices) from the browser, so a GitHub Action runs
this once a day and publishes the result on the `prices` branch.

Usage: python tools/stamp_prices.py OUT_FILE
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

BASE = 'https://tcgcsv.com/tcgplayer/3'
# TCGplayer groups that hold stamped cards: Play! Pokemon stamps come in prize packs,
# set logo stamps are prerelease and stamped promos (keyed by the app's set abbreviation)
GROUPS = {
    22880: 'prize',   # Prize Pack Series Cards
    22872: 'SVP',     # SV: Scarlet & Violet Promo Cards
    24451: 'MEP',     # ME: Mega Evolution Promo
    2545: 'SWSD',     # SWSH: Sword & Shield Promo Cards
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'card-library-prices'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main(out):
    cards = []
    for gid, kind in GROUPS.items():
        prices = {}
        for p in get(f'{BASE}/{gid}/prices')['results']:
            if p.get('marketPrice') is not None:
                prices.setdefault(p['productId'], {})[p['subTypeName']] = p['marketPrice']
        for p in get(f'{BASE}/{gid}/products')['results']:
            num = next((e['value'] for e in p.get('extendedData', []) if e['name'] == 'Number'), '')
            if not num or p['productId'] not in prices:
                continue
            # "Boss's Orders [Cyrus] - 132/172 (Regional Championships) [Staff]"
            name = re.sub(r'\s*\[[^\]]*\]', '', p['name'].split(' - ')[0]).strip()
            tags = re.findall(r'[(\[]([^)\]]+)[)\]]', p['name'].split(' - ', 1)[1] if ' - ' in p['name'] else '')
            cards.append({'g': kind, 'name': name, 'num': num, 'tags': tags, 'prices': prices[p['productId']]})
    data = {'updated': datetime.now(timezone.utc).strftime('%Y-%m-%d'), 'cards': cards}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(cards)} stamped card prices written to {out}')


if __name__ == '__main__':
    main(sys.argv[1])
