import sqlite3
c = sqlite3.connect(r"C:\Users\paolo.vilches\Documents\repos\Syntro\backend\data\syntro.db")
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("TelemetryScanSchedules present:", "TelemetryScanSchedules" in tables)
migs = [r[0] for r in c.execute("SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId DESC LIMIT 5")]
print("last migrations:", migs)
if "TelemetryScanSchedules" in tables:
    cols = [r[1] for r in c.execute("PRAGMA table_info(TelemetryScanSchedules)")]
    print("cols:", cols)
    rows = c.execute("SELECT Id, Label, Cron, TimeZone, CampusKey, IsEnabled, SortOrder, DeletedAtUtc FROM TelemetryScanSchedules").fetchall()
    print("rows:", rows)
