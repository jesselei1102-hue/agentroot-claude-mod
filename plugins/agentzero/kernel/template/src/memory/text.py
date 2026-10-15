"""Small text helpers shared by the Memory writers."""

from __future__ import annotations

import hashlib
import re


def sentence_key(sentence: str) -> str:
    """Two sentences saying the same thing compare equal: case and spacing do not matter."""
    return " ".join(sentence.split()).casefold()


_SLUG_MAX = 48


def slug(text: str) -> str:
    """A readable id fragment in the text's own script, or a stable hash when none is left.

    Letters and digits of any script survive, so "第 2 讲 Agent 评测基础" is
    `第-2-讲-agent-评测基础`. Keeping only ASCII turned it into `2-agent` and a
    second such name into `2-agent-2` — found in a real run. Separators, dots and
    slashes never survive, so the result stays safe as a file name.
    """
    readable = re.sub(r"[\W]+", "-", text.casefold()).strip("-")[:_SLUG_MAX].rstrip("-")
    if readable:
        return readable
    return "x-" + hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:8]


RESEMBLES = 0.3
"""At or above this, two Facts probably describe the same thing (see `resemblance`)."""

_COMMON_WORDS = frozenset(
    {
        "the", "and", "for", "has", "have", "with", "per", "this", "that", "these", "only", "from",
        "starting", "operator", "user", "now", "is", "are", "was", "were", "our", "their", "its",
        "every", "day", "week", "next", "last", "they", "them", "will", "would",
    }
)
_COMMON_HAN = frozenset("的了是在有和我你他她它们这那每天只下上周开始用户操作者一个也都")


def _features(sentence: str) -> set[str]:
    folded = sentence.casefold()
    words = set(re.findall(r"[a-z]{3,}", folded)) - _COMMON_WORDS
    han = re.sub(r"[^\u4e00-\u9fff]", "", folded)
    pairs = {
        han[i:i + 2] for i in range(len(han) - 1)
        if han[i] not in _COMMON_HAN and han[i + 1] not in _COMMON_HAN
    }
    return words | pairs


def resemblance(first: str, second: str) -> float:
    """How much two sentences talk about the same thing, 0..1 (Jaccard over content).

    Latin words of three letters or more, and pairs of adjacent Chinese characters,
    minus the words every Fact shares ("the operator", "每天"). Calibrated on real
    Facts: "这周每天只有 30 分钟学习时间" and "下周开始每天有一小时学习时间" score
    0.43; unrelated Facts score 0 to 0.2. It only prompts a question, never blocks.
    """
    a, b = _features(first), _features(second)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


_HAN = re.compile(r"[一-鿿]")
_REQUEST = re.compile(
    r"[?\uff1f]|帮我|请你|请帮|给我|你觉得|你认为|能不能|能否|可不可以"
    r"|\b(please|can you|could you|would you|help me)\b"
    r"|^\s*(make|write|give|organi[sz]e|create|put|draft|summari[sz]e|tell)\b",
    re.IGNORECASE,
)


def is_request(said: str) -> bool:
    """The operator's words ask for something rather than state something.

    WorkBuddy and Hermes both recorded "the operator studied lesson 2" as the operator's
    word; what the operator had said was "here is last week's lecture, make it md notes".
    Mood is not scope, though: "你不要一次过给我太多内容" asks for something and holds
    for every run. So a request is kept and the operator is told (SETTLED #85).
    """
    return bool(_REQUEST.search(said))


_STANDING = re.compile(
    r"以后|下次|每次|一直|总是|始终|今后|往后|从现在|(当|在).{0,30}(时|的时候)"
    r"|\b(always|from now on|whenever|next time|every time|each time|going forward)\b",
    re.IGNORECASE,
)


def is_standing(said: str) -> bool:
    """The operator's words say they hold beyond this task ("以后", "every time")."""
    return bool(_STANDING.search(said))


def _support_features(sentence: str) -> set[str]:
    # Latin words compare by their first four letters, so "studied" meets "study".
    folded = sentence.casefold()
    words = {word[:4] for word in re.findall(r"[a-z]{3,}", folded) if word not in _COMMON_WORDS}
    numbers = set(re.findall(r"\d+", folded))
    return words | numbers | {pair for pair in _features(sentence) if _HAN.match(pair)}


def shares_content(first: str, second: str) -> bool:
    """Whether two texts have any content word, number or character pair in common."""
    return bool(_support_features(first) & _support_features(second))


def supported_by(sentence: str, said: str) -> bool:
    """Whether a sentence recorded as the operator's says what their words say.

    Only sentences in the same script are compared: most agents record a Chinese
    operator's words as an English Fact, and no overlap measure spans that without a
    translation. Across scripts this answers yes; the quote is still stored beside the
    Fact, where the operator reads it. Within a script it asks only that the sentence
    share some content with the words: an agent rightly carries context into a Fact
    ("下周开始每天有一小时学习时间" from "下周开始我每天有一小时了"), so a share
    threshold refused good Facts. Every wrong Fact in the test kit shared nothing:
    "操作者学完了第 2 讲" from "这是我上周课的讲义".
    """
    if bool(_HAN.search(sentence)) != bool(_HAN.search(said)):
        return True
    return not _support_features(sentence) or shares_content(sentence, said)


def legacy_slug(text: str) -> str:
    """The ASCII-only slug of 0.3.4 and earlier, to find ids written before the change."""
    ascii_part = re.sub(r"[^a-z0-9_]+", "-", text.casefold()).strip("-")
    if ascii_part:
        return ascii_part
    return "x-" + hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:8]


_SENTENCE_END = "。！？!?；;\n"  # noqa: RUF001 - the operator writes Chinese
_HEARD_MAX = 500
_FILLER_MAX = 3
"""Characters left of a sentence that can be dropped as filler (a "好的" before a comma)."""


def _flat(text: str) -> str:
    return " ".join(text.split())


def _bigrams(text: str) -> set[str]:
    squeezed = "".join(text.casefold().split())
    return {squeezed[i:i + 2] for i in range(len(squeezed) - 1)}


def heard_for(said: str, heard: str | None) -> str | None:
    """The operator's message to keep beside `said`, or None.

    Kept only when `said` came from it (most of its character pairs are in it) and
    differs from it: a quote from an earlier turn must not be stored beside an
    unrelated "好的". Capped, so a pasted document is not copied into Memory.
    """
    if not heard or not said.strip():
        return None
    said_flat, heard_flat = _flat(said), _flat(heard)
    if said_flat == heard_flat:
        return None
    pairs = _bigrams(said_flat)
    if not pairs or len(pairs & _bigrams(heard_flat)) / len(pairs) < 0.5:
        return None
    return heard_flat[:_HEARD_MAX]


def cut_sentence(said: str, heard: str | None) -> str | None:
    """The operator's sentence `said` was cut out of, or None when it was not cut.

    Structural, with no word list: `said` sits inside `heard` but starts or ends
    inside a sentence, and what it leaves of that sentence is more than filler.
    "我看不过来", taken from the sentence that began "你不要一次过给我太多内容", is cut;
    a whole sentence picked from a longer message is not (SETTLED #95).
    """
    if not heard:
        return None
    said_flat, heard_flat = _flat(said).strip(), _flat(heard)
    start = heard_flat.find(said_flat)
    if not said_flat or start < 0:
        return None
    end = start + len(said_flat)
    head = heard_flat[:start]
    tail = heard_flat[end:]
    sentence_start = max(head.rfind(mark) for mark in _SENTENCE_END) + 1
    ends = [tail.find(mark) for mark in _SENTENCE_END if tail.find(mark) >= 0]
    sentence_end = end + (min(ends) if ends else len(tail))
    sentence = heard_flat[sentence_start:sentence_end].strip()
    dropped = (heard_flat[sentence_start:start] + heard_flat[end:sentence_end]).strip()
    content = "".join(char for char in dropped if char.isalnum())
    if len(content) <= _FILLER_MAX:
        return None
    return sentence

