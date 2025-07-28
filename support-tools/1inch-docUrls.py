import requests
import ast

# GitHub リポジトリから sidebars.js を raw 形式で取得する
RAW_URL = "https://raw.githubusercontent.com/1inch/1inch-docs/master/sidebars.js"
r = requests.get(RAW_URL)
r.raise_for_status()
content = r.text

# sidebars.js は JS export default {...} の形式なので、まず `{...}` 部分を ast.literal_eval 用に変換できるよう加工
# 独自の JS 構文を Python 辞書風に書き換えたりする簡易パーサが必要です
# ここでは擬似的説明
sidebar_dict = parse_sidebars_js_to_python_dict(content)

def walk_items(items, parent_label=None):
    docs = []
    for item in items:
        if isinstance(item, dict):
            t = item.get('type')
            label = item.get('label') or item.get('id') or None
            if t == 'doc' and item.get('id'):
                docs.append({
                    'label': label,
                    'path': f"/documentation/{item['id'].replace('_', '/')}"
                })
            elif t == 'category' and item.get('items'):
                docs.extend(walk_items(item['items'], label))
            elif t == 'link' and item.get('href'):
                docs.append({'label': label, 'path': item['href']})
        elif isinstance(item, str):
            docs.append({'label': item, 'path': f"/documentation/{item.replace('_', '/')}"})
    return docs

all_docs = walk_items(sidebar_dict['sidebar'])  # キーはサイドバー名に合わせて調整
for doc in all_docs:
    print(doc['label'], doc['path'])
