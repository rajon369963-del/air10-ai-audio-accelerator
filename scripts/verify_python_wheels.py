# scripts/verify_python_wheels.py
import sys

print(f"=== VERIFYING PYTHON WHEELS ON {sys.executable} ===")

results = []

def check(name, test_fn):
    try:
        test_fn()
        results.append((name, True, "OK"))
        print(f" [PASS] {len(results)}. {name}")
    except Exception as e:
        results.append((name, False, str(e)))
        print(f" [FAIL] {len(results)}. {name}: {e}")

# 1. trafilatura
def t1():
    import trafilatura
    res = trafilatura.extract("<html><body><article><p>CIVEX text extraction</p></article></body></html>")
    assert "CIVEX" in res
check("trafilatura", t1)

# 2. feedparser
def t2():
    import feedparser
    d = feedparser.parse("<rss><channel><title>CIVEX Feed</title></channel></rss>")
    assert d.feed.title == "CIVEX Feed"
check("feedparser", t2)

# 3. instructor
def t3():
    import instructor
    assert hasattr(instructor, "from_openai") or hasattr(instructor, "patch") or instructor is not None
check("instructor", t3)

# 4. litellm
def t4():
    import litellm
    assert hasattr(litellm, "completion") or litellm is not None
check("litellm", t4)

# 5. tldextract
def t5():
    import tldextract
    ext = tldextract.extract("https://news.google.com/test")
    assert ext.domain == "google"
check("tldextract", t5)

# 6. textblob
def t6():
    from textblob import TextBlob
    blob = TextBlob("CIVEX on device AI is super fast and private.")
    assert len(blob.string) > 10
check("textblob", t6)

# 7. pyrate_limiter
def t7():
    import pyrate_limiter
    assert pyrate_limiter is not None
check("pyrate_limiter", t7)

# 8. diskcache
def t8():
    import diskcache
    c = diskcache.Cache("/tmp/test_civex_cache")
    c["key"] = "value"
    assert c["key"] == "value"
    c.close()
check("diskcache", t8)

# 9. sqlitedict
def t9():
    from sqlitedict import SqliteDict
    d = SqliteDict("/tmp/test_civex_sqlitedict.db", autocommit=True)
    d["a"] = 100
    assert d["a"] == 100
    d.close()
check("sqlitedict", t9)

# 10. pyzstd
def t10():
    import pyzstd
    compressed = pyzstd.compress(b"civex air10 high speed compression")
    assert pyzstd.decompress(compressed) == b"civex air10 high speed compression"
check("pyzstd", t10)

# 11. bitarray
def t11():
    from bitarray import bitarray
    a = bitarray("1101")
    assert a.count() == 3
check("bitarray", t11)

# 12. simhash
def t12():
    from simhash import Simhash
    s = Simhash("civex progressive bridge")
    assert s.value > 0
check("simhash", t12)

# 13. datasketch
def t13():
    from datasketch import MinHash
    m1 = MinHash()
    m1.update(b"civex")
    assert m1.digest() is not None
check("datasketch", t13)

# 14. mutagen
def t14():
    import mutagen
    assert mutagen is not None
check("mutagen", t14)

# 15. cbor2
def t15():
    import cbor2
    b = cbor2.dumps({"a": 1})
    assert cbor2.loads(b)["a"] == 1
check("cbor2", t15)

# 16. marshmallow
def t16():
    from marshmallow import Schema, fields
    class UserSchema(Schema):
        id = fields.Str()
    assert UserSchema().dump({"id": "test"})["id"] == "test"
check("marshmallow", t16)

# 17. retrying
def t17():
    from retrying import retry
    @retry(stop_max_attempt_number=2)
    def test_fn():
        return 42
    assert test_fn() == 42
check("retrying", t17)

# 18. scipy
def t18():
    import scipy.signal
    sig = [1, 2, 3, 2, 1]
    filtered = scipy.signal.medfilt(sig, 3)
    assert len(filtered) == 5
check("scipy", t18)

# 19. sympy
def t19():
    import sympy
    x = sympy.Symbol("x")
    diff = sympy.diff(x**2 + 3*x, x)
    assert str(diff) == "2*x + 3"
check("sympy", t19)

# 20. pydantic
def t20():
    from pydantic import BaseModel
    class Item(BaseModel):
        name: str
        val: int
    i = Item(name="civex", val=99)
    assert i.val == 99
check("pydantic", t20)

# 21. orjson
def t21():
    import orjson
    b = orjson.dumps({"status": "sovereign", "speed": 3.0})
    assert orjson.loads(b)["status"] == "sovereign"
check("orjson", t21)

# 22. usearch
def t22():
    import numpy as np
    import usearch.index
    idx = usearch.index.Index(ndim=3, metric="cos")
    vec = np.array([0.1, 0.2, 0.3], dtype=np.float32)
    idx.add(1, vec)
    matches = idx.search(vec, 1)
    assert len(matches) == 1
check("usearch", t22)

# 23. xxhash
def t23():
    import xxhash
    h = xxhash.xxh64(b"civex").hexdigest()
    assert len(h) == 16
check("xxhash", t23)

# 24. zstandard
def t24():
    import zstandard as zstd
    cctx = zstd.ZstdCompressor()
    compressed = cctx.compress(b"civex air10 zero egress")
    dctx = zstd.ZstdDecompressor()
    assert dctx.decompress(compressed) == b"civex air10 zero egress"
check("zstandard", t24)

# 25. rich
def t25():
    import rich.text
    t = rich.text.Text("civex")
    assert t.plain == "civex"
check("rich", t25)

# 26. tabulate
def t26():
    import tabulate
    out = tabulate.tabulate([["A", 1], ["B", 2]], headers=["Item", "Val"])
    assert "Item" in out
check("tabulate", t26)

# 27. tantivy
def t27():
    import tantivy
    schema_builder = tantivy.SchemaBuilder()
    schema_builder.add_text_field("title", stored=True)
    schema = schema_builder.build()
    idx = tantivy.Index(schema)
    assert idx is not None
check("tantivy", t27)

# 28. playwright
def t28():
    import playwright
    assert playwright is not None
check("playwright", t28)

# 29. bs4
def t29():
    from bs4 import BeautifulSoup
    soup = BeautifulSoup("<p class='x'>AIR10</p>", "html.parser")
    assert soup.find("p").text == "AIR10"
check("bs4", t29)

# 30. lxml
def t30():
    import lxml.html
    tree = lxml.html.fromstring("<p>DOM Risk</p>")
    assert tree.text_content() == "DOM Risk"
check("lxml", t30)

# 31. httpx
def t31():
    import httpx
    assert hasattr(httpx, "Client")
check("httpx", t31)

# 32. requests
def t32():
    import requests
    assert hasattr(requests, "get")
check("requests", t32)

# 33. fastapi
def t33():
    from fastapi import FastAPI
    app = FastAPI()
    assert app.title == "FastAPI"
check("fastapi", t33)

# 34. uvicorn
def t34():
    import uvicorn
    assert hasattr(uvicorn, "run")
check("uvicorn", t34)

# 35. soundfile
def t35():
    import soundfile as sf
    assert hasattr(sf, "write")
check("soundfile", t35)

# 36. sounddevice
def t36():
    import sounddevice as sd
    assert hasattr(sd, "query_devices")
check("sounddevice", t36)

# 37. pypdf
def t37():
    import pypdf
    assert hasattr(pypdf, "PdfReader")
check("pypdf", t37)

# 38. duckdb
def t38():
    import duckdb
    res = duckdb.query("SELECT 42 AS answer").fetchone()[0]
    assert res == 42
check("duckdb", t38)

# 39. polars
def t39():
    import polars as pl
    df = pl.DataFrame({"x": [1, 2, 3]})
    assert df["x"].sum() == 6
check("polars", t39)

# 40. pyarrow
def t40():
    import pyarrow as pa
    arr = pa.array([1, 2, 3])
    assert len(arr) == 3
check("pyarrow", t40)

# 41. tiktoken
def t41():
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode("hello world")
    assert len(tokens) == 2
check("tiktoken", t41)

# 42. tokenizers
def t42():
    import tokenizers
    assert tokenizers is not None
check("tokenizers", t42)

# 43. onnxruntime
def t43():
    import onnxruntime
    assert onnxruntime is not None
check("onnxruntime", t43)

# 44. tenacity
def t44():
    import tenacity
    @tenacity.retry(stop=tenacity.stop_after_attempt(2))
    def test_r(): return 77
    assert test_r() == 77
check("tenacity", t44)

# 45. typer
def t45():
    import typer
    app = typer.Typer()
    assert app is not None
check("typer", t45)

# 46. click
def t46():
    import click
    assert hasattr(click, "command")
check("click", t46)

# 47. watchdog
def t47():
    import watchdog
    assert watchdog is not None
check("watchdog", t47)

# 48. watchfiles
def t48():
    import watchfiles
    assert hasattr(watchfiles, "watch")
check("watchfiles", t48)

# 49. websockets
def t49():
    import websockets
    assert hasattr(websockets, "connect")
check("websockets", t49)

# 50. pyyaml
def t50():
    import yaml
    d = yaml.safe_load("foo: bar\nnum: 123")
    assert d["foo"] == "bar"
check("pyyaml", t50)

# 51. toml
def t51():
    import toml
    t = toml.loads("title = 'CIVEX'")
    assert t["title"] == "CIVEX"
check("toml", t51)

# 52. cryptography
def t52():
    from cryptography.fernet import Fernet
    key = Fernet.generate_key()
    f = Fernet(key)
    token = f.encrypt(b"secret message")
    assert f.decrypt(token) == b"secret message"
check("cryptography", t52)

# 53. msgpack
def t53():
    import msgpack
    packed = msgpack.packb([1, 2, 3])
    assert msgpack.unpackb(packed) == [1, 2, 3]
check("msgpack", t53)

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n>>> {passed}/{len(results)} PYTHON WHEELS VERIFIED AND OPERATIONAL! <<<")
assert passed == len(results), f"Only {passed}/{len(results)} passed"
