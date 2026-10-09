"""沟通知识库：微信读书热门书单（《如何提高沟通，表达能力》61 本）的 1816 条书摘条目。

检索方案（ponytail）：条目仅千余条、总量 1.3MB——直接内存常驻 + 中文字符 bigram
重合度打分，零外部依赖（不引向量库/分词库/FTS）。升级路径：条目过万或召回不准时
换 SQLite FTS5 或 embedding 检索。
"""

import json
import re
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).parent / "data" / "communication.json"


def _bigrams(s: str) -> set[str]:
    s = re.sub(r"[^\w\u4e00-\u9fff]", "", s)
    return {s[i : i + 2] for i in range(len(s) - 1)} if len(s) > 1 else {s}


@lru_cache(maxsize=1)
def _load() -> list[dict]:
    return json.loads(_DATA.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _index() -> tuple[list[set[str]], list[set[str]]]:
    entries = _load()
    return (
        [_bigrams(e["text"]) for e in entries],
        [_bigrams(e["book"] + e["section"]) for e in entries],
    )


def search(query: str, k: int = 3) -> list[dict]:
    """bigram 重合度打分，正文命中权重高于标题。返回 [{book, section, text, score}]。"""
    if not query.strip():
        return []
    q = _bigrams(query)
    if not q:
        return []
    text_bg, title_bg = _index()
    scored = []
    for i, entry in enumerate(_load()):
        body_hit = len(q & text_bg[i])
        title_hit = len(q & title_bg[i])
        score = body_hit * 2 + title_hit
        if score > 0:
            scored.append({**entry, "score": score})
    scored.sort(key=lambda e: -e["score"])
    return scored[:k]


def format_hits(hits: list[dict]) -> str:
    if not hits:
        return "知识库中没有相关内容。"
    return "\n\n".join(f"《{h['book']}》{h['section']}：\n{h['text']}" for h in hits)
