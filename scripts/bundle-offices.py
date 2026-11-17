"""Bundle date-specific liturgy for static previews and GitHub Pages."""
import argparse
import concurrent.futures
import datetime as dt
import json
import pathlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--start", type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1))
parser.add_argument("--days", type=int, default=8)
args = parser.parse_args()
out = pathlib.Path(__file__).resolve().parents[1] / "assets" / "offices"
out.mkdir(exist_ok=True, parents=True)
offices = ["morning_prayer", "midday_prayer", "evening_prayer", "compline"]

def fetch(pair):
    date, office = pair
    url = f"https://api.dailyoffice2019.com/api/v1/office/{office}/{date}?bible_translation=kjv"
    response = subprocess.check_output(["curl", "-fsSL", "--retry", "2", "--max-time", "30", url])
    modules = json.loads(response)["modules"]
    if not modules or not any(m["lines"] for m in modules):
        raise ValueError(f"Empty service for {office} on {date}")
    return [{"name": m["name"], "lines": [
        {k: line[k] for k in ("line_type", "content", "preface") if line.get(k) is not None}
        for line in m["lines"]]} for m in modules]

dates = [str(args.start + dt.timedelta(days=i)) for i in range(args.days)]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for date in dates:
        target = out / (date + ".js")
        if target.exists():
            continue
        services = dict(zip(offices, pool.map(fetch, [(date, office) for office in offices])))
        target.write_text("window.officeBundle = " + json.dumps({"date": date, "services": services}, separators=(",", ":")) + ";\n")
(out / "dates.js").write_text("window.bundledOfficeDates = " + json.dumps(dates) + ";\n")
for file in out.glob("????-??-??.js"):
    if file.stem not in dates:
        file.unlink()
