"""知识库检索测试（真实数据文件，无 mock——数据是资产，检索质量要守住）。"""
from app.knowledge import store


def test_search_hits_relevant_entries():
    hits = store.search("幽默化解尴尬", k=2)
    assert hits, "空召回"
    joined = hits[0]["book"] + hits[0]["section"] + hits[0]["text"]
    assert "幽默" in joined or "尴尬" in joined


def test_search_empty_query():
    assert store.search("") == []
    assert store.search("!!!") == []


def test_format_hits_readable():
    text = store.format_hits(store.search("提意见", k=1))
    assert "《" in text and "》" in text


def test_data_volume_sane():
    entries = store._load()
    assert len(entries) > 1000, f"条目异常少: {len(entries)}"
    assert all(e.get("book") and e.get("text") for e in entries[:50])
