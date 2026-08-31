import sqlite3
c = sqlite3.connect(r"C:\Users\paolo.vilches\Documents\repos\Syntro\backend\data\syntro.db")
print("== TelemetryScanSchedules ==")
for r in c.execute("SELECT Id, Label, Cron, TimeZone, CampusKey, IsEnabled, SortOrder, CreatedBy, UpdatedBy, DeletedBy, DeletedAtUtc FROM TelemetryScanSchedules"):
    print(r)
print("== AuditLogEntries (network-telemetry-schedule) ==")
cols = [r[1] for r in c.execute("PRAGMA table_info(AuditLogEntries)")]
print("cols:", cols)
for r in c.execute("SELECT * FROM AuditLogEntries WHERE Resource = 'network-telemetry-schedule' ORDER BY CreatedAtUtc DESC LIMIT 8"):
    print(r)
