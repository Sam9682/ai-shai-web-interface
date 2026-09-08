"""Property-based tests for the pure helpers in document_seed_service.

Feature: docs-auto-seed-and-documents-page

These tests cover the two pure helpers that need no database or fixtures:
  - resolve_mime_type (Property 1: MIME resolution mapping)
  - infer_category   (Property 2: Category inference determinism and mapping)
"""
import pytest
from hypothesis import given, settings, strategies as st

from app.services.document_seed_service import (
    resolve_mime_type,
    infer_category,
    DEFAULT_MIME,
)
from app.models.document import DocumentCategory


# Known extensions and their expected MIME types (Requirements 3.1-3.4).
KNOWN_EXTENSIONS = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
}

# Base-name strategy: arbitrary text that does not itself introduce a
# recognised extension. We forbid '.' and path separators so the base name
# never accidentally becomes the file's suffix.
base_name_strategy = st.text(
    alphabet=st.characters(blacklist_characters="./\\", blacklist_categories=("Cs",)),
    min_size=0,
    max_size=40,
)

# Non-empty base name for cases where we append a real extension. A leading-dot
# name (e.g. ".doc") is treated by pathlib as a dotfile with no suffix, so a
# non-empty base is what makes the trailing token an actual extension.
non_empty_base_strategy = st.text(
    alphabet=st.characters(blacklist_characters="./\\", blacklist_categories=("Cs",)),
    min_size=1,
    max_size=40,
)


def _mix_case(ext: str, seed: int) -> str:
    """Deterministically produce a mixed-case variant of an extension."""
    out = []
    for i, ch in enumerate(ext):
        out.append(ch.upper() if (seed >> i) & 1 else ch.lower())
    return "".join(out)


# ---------------------------------------------------------------------------
# Property 1: MIME resolution mapping
# Feature: docs-auto-seed-and-documents-page
# Validates: Requirements 3.1, 3.2, 3.3, 3.4
# ---------------------------------------------------------------------------

@pytest.mark.property
@settings(max_examples=200)
@given(
    base=non_empty_base_strategy,
    ext=st.sampled_from(sorted(KNOWN_EXTENSIONS.keys())),
    case_seed=st.integers(min_value=0, max_value=15),
)
def test_property_known_extension_maps_to_expected_mime(base, ext, case_seed):
    """Property 1: any known extension resolves to its fixed MIME type,
    independent of the base name and of the extension's letter case.

    Validates Requirements 3.1, 3.2, 3.3, 3.4.
    """
    expected = KNOWN_EXTENSIONS[ext]
    cased_ext = _mix_case(ext, case_seed)
    filename = f"{base}{cased_ext}"

    result = resolve_mime_type(filename)

    assert result == expected
    # Case-insensitive: the mixed-case extension yields the same result as the
    # canonical lower-case extension, and the base name does not affect it.
    assert result == resolve_mime_type(f"file{ext}")
    assert resolve_mime_type(f"{base}{ext}") == resolve_mime_type(f"other{ext}")


@pytest.mark.property
@settings(max_examples=200)
@given(
    base=non_empty_base_strategy,
    other_ext=st.text(
        alphabet=st.characters(
            whitelist_categories=("Ll", "Lu", "Nd"),
        ),
        min_size=1,
        max_size=6,
    ),
)
def test_property_unknown_extension_maps_to_default(base, other_ext):
    """Property 1: any extension not in the known set (and the no-extension
    case) resolves to the default 'application/octet-stream'.

    Validates Requirement 3 (default branch of 3.1-3.4).
    """
    ext = f".{other_ext}"
    # Skip cases that happen to be a known extension (case-insensitively).
    if ext.lower() in KNOWN_EXTENSIONS:
        return

    filename = f"{base}{ext}"
    assert resolve_mime_type(filename) == DEFAULT_MIME


@pytest.mark.property
@settings(max_examples=100)
@given(base=base_name_strategy)
def test_property_absent_extension_maps_to_default(base):
    """Property 1: a name with no extension resolves to the default MIME.

    Validates Requirement 3 (absent-extension default).
    """
    # base_name_strategy excludes '.', so `base` has no suffix.
    assert resolve_mime_type(base) == DEFAULT_MIME


def test_known_extension_examples():
    """Targeted examples for each known extension (Requirements 3.1-3.4)."""
    assert resolve_mime_type("statutes.md") == "text/markdown"
    assert resolve_mime_type("notes.txt") == "text/plain"
    assert resolve_mime_type("report.pdf") == "application/pdf"
    assert resolve_mime_type("charter.doc") == "application/msword"
    # Case-insensitivity of the extension.
    assert resolve_mime_type("README.MD") == "text/markdown"
    assert resolve_mime_type("README.Md") == "text/markdown"
    # Unknown / absent extension defaults.
    assert resolve_mime_type("archive.zip") == DEFAULT_MIME
    assert resolve_mime_type("Makefile") == DEFAULT_MIME


# ---------------------------------------------------------------------------
# Property 2: Category inference determinism and mapping
# Feature: docs-auto-seed-and-documents-page
# Validates: Requirements 4.1, 4.2, 4.3, 4.4
# ---------------------------------------------------------------------------

# Keyword sets mirroring CATEGORY_KEYWORDS precedence in the service.
STATUTE_KEYWORDS = ("statut",)
MINUTE_KEYWORDS = ("minute", "compte")
FINANCIAL_KEYWORDS = ("financ", "report", "rapport")
ALL_KEYWORDS = STATUTE_KEYWORDS + MINUTE_KEYWORDS + FINANCIAL_KEYWORDS


def _expected_category(name: str) -> DocumentCategory:
    """Reference implementation of the documented precedence."""
    lowered = name.lower()
    if any(k in lowered for k in STATUTE_KEYWORDS):
        return DocumentCategory.STATUTES
    if any(k in lowered for k in MINUTE_KEYWORDS):
        return DocumentCategory.MINUTES
    if any(k in lowered for k in FINANCIAL_KEYWORDS):
        return DocumentCategory.FINANCIAL_REPORTS
    return DocumentCategory.OTHER


@pytest.mark.property
@settings(max_examples=200)
@given(name=st.text(min_size=0, max_size=60))
def test_property_category_matches_precedence_and_is_deterministic(name):
    """Property 2: infer_category is deterministic and follows the fixed
    precedence statut > minute/compte > financ/report/rapport > other.

    Validates Requirements 4.1, 4.2, 4.3, 4.4.
    """
    first = infer_category(name)
    # Determinism: same input always yields the same output.
    assert infer_category(name) == first
    assert infer_category(name) == first  # repeat call, still stable
    # Mapping matches the documented precedence.
    assert first == _expected_category(name)


@pytest.mark.property
@settings(max_examples=200)
@given(
    prefix=st.text(max_size=15),
    keyword=st.sampled_from(ALL_KEYWORDS),
    suffix=st.text(max_size=15),
)
def test_property_keyword_presence_drives_category(prefix, keyword, suffix):
    """Property 2: a name containing a keyword is classified per precedence,
    regardless of surrounding text or case.

    Validates Requirements 4.1, 4.2, 4.3.
    """
    name = f"{prefix}{keyword}{suffix}"
    assert infer_category(name) == _expected_category(name)
    # Case-insensitive matching.
    assert infer_category(name.upper()) == _expected_category(name.upper())


def test_category_precedence_examples():
    """Targeted precedence examples (Requirements 4.1-4.4)."""
    # Pure single-category matches.
    assert infer_category("statuts_2024.pdf") == DocumentCategory.STATUTES
    assert infer_category("minutes_march.pdf") == DocumentCategory.MINUTES
    assert infer_category("compte_rendu.pdf") == DocumentCategory.MINUTES
    assert infer_category("financial_report.pdf") == DocumentCategory.FINANCIAL_REPORTS
    assert infer_category("rapport_annuel.pdf") == DocumentCategory.FINANCIAL_REPORTS
    assert infer_category("random.pdf") == DocumentCategory.OTHER

    # Precedence: statut wins over everything else.
    assert infer_category("statut_financial_report.pdf") == DocumentCategory.STATUTES
    assert infer_category("statut_minute.pdf") == DocumentCategory.STATUTES
    # Precedence: minute wins over financial.
    assert infer_category("minute_financial.pdf") == DocumentCategory.MINUTES
    assert infer_category("compte_rapport.pdf") == DocumentCategory.MINUTES

    # Determinism sanity check.
    assert infer_category("statut_financial_report.pdf") == infer_category(
        "statut_financial_report.pdf"
    )
