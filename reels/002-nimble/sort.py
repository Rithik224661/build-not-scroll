# sort.py - route every email in a folder with Ollama's local nimble model.
# Usage: python sort.py inbox/   (add --move to file each email into inbox/<team>/)
# Needs: Ollama v0.40.4+ and `ollama pull nimble` (about 9.5 GB). Runs 100% on your machine.
import collections, json, pathlib, shutil, subprocess, sys

TEAMS = {"billing": "Payments, refunds, invoices", "technical": "Bugs, errors, login problems",
         "sales": "Pricing, demos, partnerships", "other": "Anything else"}
ASK = ["--ask", "Which team should handle this email?"] + [a for k, v in TEAMS.items() for a in ("--choice", f"{k}={v}")]

folder, move, counts = pathlib.Path(sys.argv[1]), "--move" in sys.argv, collections.Counter()
for f in sorted(folder.glob("*.txt")):
    out = subprocess.run(["ollama", "run", "nimble", *ASK, "--format", "json"],
                         input=f.read_text(), capture_output=True, text=True, check=True).stdout
    answer = next(iter(json.loads(out)["answers"].values()))
    team, conf = answer["choice"], answer["probabilities"][answer["choice"]]
    print(f"{f.name:<28} {team:<10} {conf:.0%}"); counts[team] += 1
    if move:
        (folder / team).mkdir(exist_ok=True)
        shutil.move(str(f), folder / team / f.name)
print("\n" + "  ".join(f"{t}: {n}" for t, n in counts.most_common()))
