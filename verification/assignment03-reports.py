"""Refresh the existing Assignment 3 drafts from the exact final collection manifest."""
import json
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor

root = Path(__file__).resolve().parent.parent
local = root / ".local-data"
originals = root.parent.parent / "outputs" / "assignment03"
out = local / "final"
out.mkdir(exist_ok=True)
members = json.loads((local / "manifest.json").read_text())
run = json.loads((local / "results/final-collections.json").read_text())

def para(doc, text, bold=False, size=11, font="Times New Roman"):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.05
    r = p.add_run(text)
    r.bold = bold
    r.font.name = font
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor(0, 0, 0)
    return p

def excerpt(file, method, url):
    route = url.split("?", 1)[0].split("/patients/{{patientId}}", 1)[-1]
    route = re.sub(r"\{\{[^}]+\}\}|(?<=/)\d{6,}(?=/|$)", ":id", route)
    source = root / "server/v1" / (file + ".js")
    lines = source.read_text(encoding="utf-8").splitlines()
    if file == "tasks" and method in ("PATCH", "DELETE") and route.endswith("/notes/:id"):
        start = next(i for i, line in enumerate(lines) if 'for (const method of ["patch", "delete"])' in line)
    else:
        pattern = re.escape(route).replace(":id", ":[A-Za-z]+")
        match = re.search(r'patient\.' + method.lower() + r'\(\s*"' + pattern + '"', "\n".join(lines))
        if match:
            start = "\n".join(lines).count("\n", 0, match.start())
        elif route == "/prescriptions" and method == "GET":
            source = root / "server/v1/app.js"
            lines = source.read_text(encoding="utf-8").splitlines()
            start = next(i for i, line in enumerate(lines) if 'for (const [route, model, perm]' in line)
        else:
            raise ValueError((file, method, route))
    snippet = lines[start:start+10]
    if file == "tasks" and method in ("PATCH", "DELETE") and route.endswith("/notes/:id"):
        guard = next(i for i in range(start, len(lines)) if 'String(old.authorUserId)' in lines[i])
        snippet = lines[start:start+2] + ["    // ... validate body and read the task-scoped note"] + lines[guard:guard+11] + ["    // ... append note_edited/note_deleted history with previousText"]
    return source.relative_to(root).as_posix(), start + 1, "\n".join(snippet)

browser = {
    1499: "Real browser OCR imported step21-synthetic-prescription.png successfully. The draft was completed, explicitly reviewed and confirmed. Pause review showed the chosen UTC and local boundary, two affected pending events and one retained earlier event. Cancel left the full schedule/event read-back unchanged. Confirm paused exactly the two later events; the earlier event remained pending.",
    1205: "Browser note-deletion Cancel retained the saved note and card revision. Confirmation cleared only the note, preserving the card ID, selected source ID and five original label passages. Saving a new note and removing the selected source retained the note. Original openFDA passages were displayed directly without a generated summary. B1 Active, Paused and Completed filters, Archive and Remove remain in the numbered capture sequence.",
    1212: "Browser C1 author editing saved the changed text and retained the original in history. Delete Cancel retained the note; Confirm delete removed it from current notes and retained the deletion and previous text in history. The collection rejected a task-accessible non-author's PATCH and DELETE with HTTP 403 and verified unchanged read-backs. Browser C2 skip Cancel left all three pending occurrences at revision zero. Confirm skipped created exactly one action. Another occurrence was recorded taken, a third was snoozed, and a reasoned correction retained the original taken action. The existing replay and reminder workflow also passed in the collection. Inventory had no synthetic stock balance and correctly reported needs review.",
}

for member in members:
    observed = next(r for r in run["results"] if r["port"] == member["port"])
    if observed["failures"]:
        raise RuntimeError(observed["failures"])
    filename = "MediMate_Assignment03_" + member["slug"] + ".docx"
    doc = Document(originals / filename)
    # Keep the submitted report's existing cover and typography, replacing its generated body.
    for p in list(doc.paragraphs)[21:]:
        p._element.getparent().remove(p._element)
    for p in doc.paragraphs:
        if "13 November 2026" in p.text:
            for r in p.runs:
                r.text = r.text.replace("13 November 2026", "15 November 2026")
    statuses = {e["name"]: e["status"] for e in observed["entries"]}
    for group in member["groups"]:
        for index, item in enumerate(group["items"]):
            doc.add_page_break()
            if index == 0:
                para(doc, group["name"], True, 14)
            req = item["request"]
            method, url = req["method"], req["url"]["raw"]
            file, line, code = excerpt(group["file"], method, url)
            para(doc, item["name"], True, 14)
            para(doc, "HTTP method  " + method)
            para(doc, "Endpoint URL  " + url.replace("{{baseUrl}}", f"http://127.0.0.1:{member['port']}/api/v1"), size=10)
            para(doc, "Headers  Session Cookie" + (", X-CSRF-Token, Idempotency-Key UUID, Content-Type application/json" if method != "GET" else ""), size=10)
            params = req["url"].get("query", [])
            if params:
                para(doc, "Postman Params  " + ", ".join(p["key"] + " = " + p["value"] for p in params), size=10)
            body = req.get("body", {}).get("raw")
            if body:
                para(doc, "Postman Body in raw JSON", True)
                para(doc, body, size=9, font="Consolas")
            else:
                para(doc, "Request body  None.")
            para(doc, f"Express excerpt  {file}, line {line}", True, 10)
            para(doc, code, size=8.5, font="Consolas")
            para(doc, f"Observed on this device  HTTP {statuses[item['name']]}", True)
            para(doc, "Run all following read-back and authorization requests before advancing the scenario. The collection carries current revisions between writes.", size=10)
            para(doc, "Postman screenshot " + item["name"].split()[0], True)
            para(doc, "Insert the screenshot of this saved request showing method, actual URL, Params or raw JSON, HTTP status and response. Hide cookies, CSRF values, passwords and idempotency keys.\n\n\n", size=10)
    doc.add_page_break()
    para(doc, "Verification and numbered capture list", True, 14)
    para(doc, "Checkout base  5a920e455a4d7651cc515d34a30206bedad4c49c on feature/step31-pharmacy, with preserved and updated local Assignment 3 changes.", size=10)
    para(doc, f"Current device run  {observed['requests']['total']} requests, {observed['assertions']['total']} assertions, zero failures. MongoDB 7.0.24 replica set on 27028; Express on {member['port']}.")
    para(doc, "Provider modes  Live RxNorm and openFDA for the final Faraaz collection; Telegram disabled. No live Telegram delivery is claimed. Browser OCR used Tesseract on the device.")
    para(doc, browser[member["port"]])
    para(doc, f"Capture status  0 of {len(observed['captures'])} Postman screenshots captured. Run both feature folders from top to bottom, including unnumbered setup, rejected attempts and read-backs.")
    for name in observed["captures"]:
        para(doc, name, size=10)
    doc.core_properties.title = "MediMate Assignment 03 " + member["name"]
    doc.save(out / filename)
    print(filename, len(observed["captures"]), "capture slots")
