import sqlite3

def dump(path, label):
    print(f"\n{'='*70}\n{label}: {path}\n{'='*70}")
    c = sqlite3.connect(path)
    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__EFMigrationsHistory' ORDER BY name")]
    for t in tables:
        cols = c.execute(f"PRAGMA table_info([{t}])").fetchall()
        print(f"\n-- {t} --")
        for col in cols:
            print(f"   {col[1]} ({col[2]})" + (" PK" if col[5] else "") + ("" if col[4] == 0 else " NOT NULL"))

dump(r"C:\Users\paolo.vilches\AppData\Local\Temp\opencode\sotero_live.db", "SOTERO SOURCE")
dump(r"C:\Users\paolo.vilches\Documents\repos\Syntro\backend\data\syntro.db", "SYNTRO TARGET")
