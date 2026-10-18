"""Verify all source requirement IDs and exact table criteria against the versioned DOCX."""
from pathlib import Path
import hashlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "docs/requirements/problem-statement.docx"
expected_hash = "cd3ded4437822f60a3bdb851256558d2b70a8f50a0d80cb48307e499c2f30745"
if hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash:
    sys.exit("ERROR: official source fingerprint changed; review source provenance explicitly")
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
with zipfile.ZipFile(source) as archive:
    doc = ET.fromstring(archive.read("word/document.xml"))
requirements = {}
for row in doc.findall(".//w:tbl/w:tr", ns):
    cells = [" ".join("".join(t.text or "" for t in p.findall(".//w:t", ns))
             for p in cell.findall(".//w:p", ns)).strip()
             for cell in row.findall("./w:tc", ns)]
    if cells and re.fullmatch(r"(?:F[1-5]\.\d+|I[1-5]\.\d+|Q\d+)", cells[0]):
        if cells[0] in requirements:
            sys.exit("ERROR: duplicate requirement ID in source")
        requirements[cells[0]] = cells[1:3]
rows = {}
for line in (ROOT / "docs/requirements/traceability.md").read_text().splitlines():
    if not re.match(r"^\| (?:F[1-5]\.\d+|I[1-5]\.\d+|Q\d+) \|", line):
        continue
    cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", line)[1:-1]]
    if len(cells) != 9 or cells[0] in rows:
        sys.exit("ERROR: invalid/duplicate traceability row")
    rows[cells[0]] = cells
if set(rows) != set(requirements) or len(rows) != 81:
    sys.exit("ERROR: requirement ID coverage differs from the 81 source IDs")
for ident, original in requirements.items():
    if rows[ident][1:3] != original:
        sys.exit(f"ERROR: source summary/acceptance text changed for {ident}")
    if not all(rows[ident][3:]):
        sys.exit(f"ERROR: incomplete ownership/artifact/verification mapping for {ident}")
print("PASS: source fingerprint; 81 unique exact criteria (31 functional, 36 integration, 14 quality); complete mapping columns")
