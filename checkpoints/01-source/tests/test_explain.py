# Tests: eTag vs content hash, as the Sync tab's "See the difference" panel shows them.
# Each test starts from Friday with no index (the `friday` fixture).

from app.ingest.explain import explain_doc
from app.ingest.sync import run_sync


def test_same_etag_means_the_sync_never_opened_the_file(friday):
    run_sync(apply=True)
    r = explain_doc("ENG-WIKI-VECTOR-DB")
    assert r["action"] == "unchanged"
    assert r["etag"]["index"] == r["etag"]["source"]
    assert r["hash"]["computed_by_sync"] is False            # stopped at the eTag
    assert r["hash"]["index"] == r["hash"]["source"]         # computed here, for the comparison
    assert r["bytes"]["diff"] == [] and r["text"]["diff"] == []


def test_a_footer_edit_changes_the_etag_but_not_the_content_hash(friday, events):
    run_sync(apply=True)
    friday.apply_event(events[5])
    r = explain_doc("ENG-WIKI-VECTOR-DB")
    assert r["action"] == "touch"
    assert r["etag"]["index"] != r["etag"]["source"]
    assert r["hash"]["index"] == r["hash"]["source"]
    assert r["bytes"]["diff"]                                # the footer is in the bytes...
    assert r["text"]["diff"] == []                           # ...but not in the text we embed


def test_a_real_edit_changes_both(friday, events):
    run_sync(apply=True)
    friday.apply_event(events[2])
    r = explain_doc("HR-LEAVE")
    assert r["action"] == "change"
    assert r["etag"]["index"] != r["etag"]["source"]
    assert r["hash"]["index"] != r["hash"]["source"]
    ops = {line["op"] for line in r["text"]["diff"]}
    assert {"-", "+"} <= ops
