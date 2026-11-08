import csv
import io
import json
from zipfile import ZipFile
from defusedxml import ElementTree
from openpyxl import load_workbook
from fastapi import HTTPException

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate field")
        result[key] = value
    return result


def parse(filename, content):
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Maximum file size is 2 MiB")
    ext = filename.rsplit(".", 1)[-1].lower()
    try:
        if ext == "csv":
            reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
            headers = reader.fieldnames or []
            if not headers or len(set(headers)) != len(headers):
                raise ValueError("Duplicate or missing headers")
            rows = list(reader)
        elif ext == "json":
            rows = json.loads(content, object_pairs_hook=unique_fields)
        elif ext == "xml":
            root = ElementTree.fromstring(content)
            if root.tag != "employees":
                raise ValueError("XML root must be employees")
            rows = []
            for employee in root:
                if employee.tag != "employee" or any(
                    len(c) or c.attrib for c in employee
                ):
                    raise ValueError("Expected flat employee elements")
                rows.append(unique_fields((c.tag, c.text or "") for c in employee))
        elif ext == "xlsx":
            with ZipFile(io.BytesIO(content)) as z:
                if sum(i.file_size for i in z.infolist()) > 10 * 1024 * 1024:
                    raise ValueError("Expanded workbook exceeds limit")
            book = load_workbook(io.BytesIO(content), read_only=True, data_only=False)
            sheet = book.active
            data = sheet.iter_rows(values_only=True)
            headers = next(data)
            if any(not isinstance(h, str) or not h for h in headers) or len(
                set(headers)
            ) != len(headers):
                raise ValueError("Duplicate or missing headers")
            rows = []
            for index, row in enumerate(data):
                if index >= MAX_ROWS:
                    raise ValueError("Maximum 500 rows")
                if any(isinstance(v, str) and v.startswith("=") for v in row):
                    raise ValueError("Spreadsheet formulas are not accepted")
                if any(v is not None for v in row):
                    rows.append(dict(zip(headers, row)))
            book.close()
        else:
            raise ValueError("Use CSV, XLSX, XML or JSON")
        if (
            not isinstance(rows, list)
            or not rows
            or len(rows) > MAX_ROWS
            or not all(isinstance(r, dict) for r in rows)
        ):
            raise ValueError("Provide between 1 and 500 employee objects")
        return rows
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(
            422, "Invalid import structure, encoding, or file limits"
        ) from exc
