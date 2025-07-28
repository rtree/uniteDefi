import requests
import ast
import re

RAW_URL = "https://raw.githubusercontent.com/1inch/1inch-docs/master/sidebars.js"
res = requests.get(RAW_URL)
res.raise_for_status()
text = res.text

m = re.search(r"module\.exports\s*=\s*(\{[\s\S]*\});", text)
if not m:
    raise RuntimeError("Could not locate module.exports in sidebars.js")
js_obj = m.group(1)

py_obj = js_obj \
    .replace("type:", "'type':") \
    .replace("label:", "'label':") \
    .replace("items:", "'items':") \
    .replace("href:", "'href':") \
    .replace("id:", "'id':")

sidebar = ast.literal_eval(py_obj)

def walk(items):
    docs = []
    for it in items:
        if isinstance(it, dict):
            typ = it.get("type")
            label = it.get("label") or it.get("id", "")
            if typ == "doc" and it.get("id"):
                path = "/documentation/" + it["id"].replace("_", "/")
                docs.append({"label": label, "path": path})
            elif typ == "category":
                docs.extend(walk(it.get("items", [])))
            elif typ == "link" and it.get("href"):
                docs.append({"label": label, "path": it["href"]})
        elif isinstance(it, str):
            docs.append({"label": it, "path": "/documentation/" + it.replace("_", "/")})
    return docs

docs_list = walk(sidebar.get("sidebar", []))
for doc in docs_list:
    print(f"{doc['label']} ⇨ {doc['path']}")
