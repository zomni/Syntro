#!/usr/bin/env python3
"""
Migracion one-shot de datos de captura de sotero_map_api -> Pireon.

Copia NetworkTelemetrySnapshots, NetworkTelemetryObservations, ScheduledScanRuns
y TelemetryScanSchedules desde la BD de Sotero hacia la organizacion/campus
indicado de Pireon, sin modificar valores de dominio.

- Snapshots/Observations/ScanRuns: reciben GUID nuevo como Id.
- TelemetryScanSchedules: preserva el Guid original.
- FK int -> Guid de snapshots se remapea via tabla de traduccion en memoria.
- FKs int a inventario/equipos/usuarios de Sotero quedan NULL (espacios de IDs
  incompatibles con Pireon).
- Campos nuevos de Pireon con defaults: MatchKey='', ScoringSource='rule-only',
  MlProbability=NULL, RuleBasedScore=NULL, MlScoredDeviceCount=0.
- Fechas se copian verbatim (TEXT de SQLite).

Modo por defecto es DRY-RUN (no escribe). Usar --apply para ejecutar.
"""

import argparse
import sqlite3
import sys
import uuid
from pathlib import Path

BATCH_SIZE = 5000


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def new_guid() -> str:
    return str(uuid.uuid4()).upper()


def fetch_counts(conn: sqlite3.Connection, tables: list[str]) -> dict:
    counts = {}
    for t in tables:
        cur = conn.execute(f"SELECT COUNT(*) FROM {qident(t)}")
        counts[t] = cur.fetchone()[0]
    return counts


def check_columns(conn: sqlite3.Connection, table: str, required: list[str]) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({qident(table)})")}
    missing = [c for c in required if c not in existing]
    if missing:
        raise SystemExit(
            f"ERROR: la tabla {table} destino no tiene las columnas: {missing}"
        )


def insert_batches(dest: sqlite3.Connection, table: str, columns: list[str], rows):
    sql = (
        f"INSERT INTO {qident(table)} ({', '.join(qident(c) for c in columns)}) "
        f"VALUES ({', '.join('?' for _ in columns)})"
    )
    total = 0
    batch = []
    for row in rows:
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            dest.executemany(sql, batch)
            total += len(batch)
            batch.clear()
    if batch:
        dest.executemany(sql, batch)
        total += len(batch)
    return total


def migrate_snapshots(src: sqlite3.Connection, dest: sqlite3.Connection, campus: str):
    src_cols = [
        "Id", "SourceName", "SourceType", "Status", "RiskLevel", "RiskScore",
        "DeviceCount", "ConnectedUserCount", "HighRiskDeviceCount",
        "MediumRiskDeviceCount", "LowRiskDeviceCount", "ObservedAtUtc",
        "WindowStartUtc", "WindowEndUtc", "Notes", "PayloadJson",
        "CreatedByUsername", "CreatedAtUtc",
    ]
    dst_cols = [
        "Id", "CampusKey", "SourceName", "SourceType", "Status", "RiskLevel",
        "RiskScore", "DeviceCount", "ConnectedUserCount", "HighRiskDeviceCount",
        "MediumRiskDeviceCount", "LowRiskDeviceCount", "MlScoredDeviceCount",
        "ObservedAtUtc", "WindowStartUtc", "WindowEndUtc", "Notes", "PayloadJson",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc", "CreatedBy", "UpdatedBy",
        "DeletedBy", "Version", "IsActive",
    ]
    check_columns(dest, "NetworkTelemetrySnapshots", dst_cols)

    id_map: dict[int, str] = {}
    cursor = src.execute(
        f"SELECT {', '.join(qident(c) for c in src_cols)} "
        f"FROM NetworkTelemetrySnapshots ORDER BY Id"
    )

    def rows():
        while True:
            chunk = cursor.fetchmany(BATCH_SIZE)
            if not chunk:
                return
            for r in chunk:
                old_id = r[0]
                guid = new_guid()
                id_map[old_id] = guid
                yield (
                    guid, campus,
                    r[1], r[2], r[3], r[4], r[5],
                    r[6], r[7], r[8], r[9], r[10],
                    0,
                    r[11], r[12], r[13], r[14], r[15],
                    r[17], r[17], None,
                    r[16], "", "", 0, 1,
                )

    inserted = insert_batches(dest, "NetworkTelemetrySnapshots", dst_cols, rows())
    return inserted, id_map


def migrate_observations(src: sqlite3.Connection, dest: sqlite3.Connection,
                         campus: str, id_map: dict[int, str]):
    src_cols = [
        "NetworkTelemetrySnapshotId", "ObservationType", "ExternalKey",
        "DeviceName", "Username", "Domain", "IpAddress", "MacAddress",
        "SerialNumber", "HostName", "DeviceCategory", "OperatingSystem",
        "OperatingSystemVersion", "Manufacturer", "Model", "Processor",
        "MemoryGb", "DiskTotalGb", "DiskFreeGb", "LastBootAtUtc", "IsOnline",
        "DomainJoined", "IsVirtualMachine", "PingMs", "AntivirusStatus",
        "AntivirusVersion", "PatchStatus", "AgentVersion", "OpenPorts",
        "SubnetCidr", "NetworkProfile", "BuildingExternalId",
        "RoomExternalId", "Status", "RiskLevel", "RiskScore",
        "RiskReasonsJson", "RawJson", "ObservedAtUtc", "CreatedAtUtc",
    ]
    dst_cols = [
        "Id", "NetworkTelemetrySnapshotId", "ObservationType", "ExternalKey",
        "DeviceName", "Username", "Domain", "IpAddress", "MacAddress",
        "SerialNumber", "HostName", "DeviceCategory", "OperatingSystem",
        "OperatingSystemVersion", "Manufacturer", "Model", "Processor",
        "MemoryGb", "DiskTotalGb", "DiskFreeGb", "LastBootAtUtc", "IsOnline",
        "DomainJoined", "IsVirtualMachine", "PingMs", "AntivirusStatus",
        "AntivirusVersion", "PatchStatus", "AgentVersion", "OpenPorts",
        "SubnetCidr", "NetworkProfile", "BuildingExternalId",
        "RoomExternalId", "ImportedInventoryItemId", "SyncedEquipmentId",
        "AuthUserId", "MatchKey", "Status", "RiskLevel", "RiskScore",
        "RiskReasonsJson", "ScoringSource", "MlProbability",
        "RuleBasedScore", "RawJson", "ObservedAtUtc", "CreatedAtUtc",
        "UpdatedAtUtc", "DeletedAtUtc", "CreatedBy", "UpdatedBy",
        "DeletedBy", "Version", "IsActive",
    ]
    check_columns(dest, "NetworkTelemetryObservations", dst_cols)

    missing_fk = 0
    cursor = src.execute(
        f"SELECT {', '.join(qident(c) for c in src_cols)} "
        f"FROM NetworkTelemetryObservations ORDER BY Id"
    )

    def rows():
        nonlocal missing_fk
        while True:
            chunk = cursor.fetchmany(BATCH_SIZE)
            if not chunk:
                return
            for r in chunk:
                snap_guid = id_map.get(r[0])
                if snap_guid is None:
                    missing_fk += 1
                    continue
                guid = new_guid()
                yield (
                    guid, snap_guid,
                    r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9],
                    r[10], r[11], r[12], r[13], r[14], r[15], r[16], r[17],
                    r[18], r[19], r[20], r[21], r[22], r[23], r[24], r[25],
                    r[26], r[27], r[28], r[29], r[30], r[31], r[32],
                    None, None, None,
                    "",
                    r[33], r[34], r[35], r[36],
                    "rule-only", None, None,
                    r[37], r[38], r[39],
                    r[39], None, "", "", "", 0, 1,
                )

    inserted = insert_batches(dest, "NetworkTelemetryObservations", dst_cols, rows())
    return inserted, missing_fk


def migrate_scan_runs(src: sqlite3.Connection, dest: sqlite3.Connection,
                      campus: str, id_map: dict[int, str]):
    src_cols = [
        "ScheduledAtUtc", "StartedAtUtc", "CompletedAtUtc", "Status",
        "ErrorMessage", "SnapshotId", "ScheduledTimeLocal",
        "ScheduledDayLocal", "DeviceCount", "UserCount", "NormalizedCron",
        "ScheduleLabel", "CreatedAtUtc",
    ]
    dst_cols = [
        "Id", "CampusKey", "ScheduledAtUtc", "StartedAtUtc", "CompletedAtUtc",
        "Status", "ErrorMessage", "SnapshotId", "ScheduledTimeLocal",
        "ScheduledDayLocal", "DeviceCount", "UserCount", "NormalizedCron",
        "ScheduleLabel", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]
    check_columns(dest, "ScheduledScanRuns", dst_cols)

    cursor = src.execute(
        f"SELECT {', '.join(qident(c) for c in src_cols)} "
        f"FROM ScheduledScanRuns ORDER BY Id"
    )
    unmapped_snapshot = 0

    def rows():
        nonlocal unmapped_snapshot
        while True:
            chunk = cursor.fetchmany(BATCH_SIZE)
            if not chunk:
                return
            for r in chunk:
                snapshot_guid = id_map.get(r[5]) if r[5] is not None else None
                if r[5] is not None and snapshot_guid is None:
                    unmapped_snapshot += 1
                created = r[12]
                yield (
                    new_guid(), campus,
                    r[0], r[1], r[2], r[3], r[4], snapshot_guid,
                    r[6], r[7], r[8], r[9], r[10], r[11],
                    created, created, None, "", "", "", 0, 1,
                )

    inserted = insert_batches(dest, "ScheduledScanRuns", dst_cols, rows())
    return inserted, unmapped_snapshot


def migrate_schedules(src: sqlite3.Connection, dest: sqlite3.Connection, campus: str):
    dst_cols = [
        "Id", "Label", "Cron", "TimeZone", "CampusKey", "IsEnabled",
        "SortOrder", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]
    check_columns(dest, "TelemetryScanSchedules", dst_cols)

    cursor = src.execute(
        "SELECT Id, Label, Cron, TimeZone, IsEnabled, SortOrder, "
        "CreatedAtUtc, UpdatedAtUtc, DeletedAtUtc "
        "FROM TelemetryScanSchedules ORDER BY CreatedAtUtc"
    )
    rows_src = cursor.fetchall()

    def rows():
        for r in rows_src:
            deleted = r[8]
            updated = r[7] if r[7] is not None else r[6]
            yield (
                str(r[0]).upper(), r[1], r[2], r[3] or "America/Santiago",
                campus, r[4], r[5],
                r[6], updated, deleted,
                "", "", "", 0,
                0 if deleted is not None else 1,
            )

    inserted = insert_batches(dest, "TelemetryScanSchedules", dst_cols, rows())
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Ruta al soteromap.db origen")
    parser.add_argument("--dest", required=True, help="Ruta al pireon.db destino")
    parser.add_argument("--campus", default="sotero", help="CampusKey destino en Pireon")
    parser.add_argument("--apply", action="store_true",
                        help="Ejecuta borrado+migracion. Sin este flag solo informa.")
    args = parser.parse_args()

    src_path = Path(args.source)
    dest_path = Path(args.dest)
    if not src_path.is_file():
        raise SystemExit(f"ERROR: no existe el origen {src_path}")
    if not dest_path.is_file():
        raise SystemExit(f"ERROR: no existe el destino {dest_path}")

    src = sqlite3.connect(f"file:{src_path.as_posix()}?mode=ro", uri=True)
    dest = sqlite3.connect(str(dest_path))
    dest.isolation_level = None
    dest.execute("PRAGMA foreign_keys=ON")

    tables = [
        "NetworkTelemetrySnapshots",
        "NetworkTelemetryObservations",
        "ScheduledScanRuns",
        "TelemetryScanSchedules",
    ]

    src_counts = fetch_counts(src, tables)
    dest_counts = fetch_counts(dest, tables)
    dest_scope = {}
    for t in tables:
        col = "CampusKey" if t != "NetworkTelemetryObservations" else None
        if col:
            cur = dest.execute(
                f"SELECT COUNT(*) FROM {qident(t)} WHERE CampusKey=?", (args.campus,)
            )
        else:
            cur = dest.execute(
                "SELECT COUNT(*) FROM NetworkTelemetryObservations o "
                "JOIN NetworkTelemetrySnapshots s ON s.Id=o.NetworkTelemetrySnapshotId "
                "WHERE s.CampusKey=?",
                (args.campus,),
            )
        dest_scope[t] = cur.fetchone()[0]

    print("== CONTEOS ORIGEN (sotero) ==")
    for t, n in src_counts.items():
        print(f"  {t}: {n}")
    print("== CONTEOS DESTINO (pireon) totales / en scope del campus ==")
    for t in tables:
        print(f"  {t}: {dest_counts[t]} / {dest_scope[t]}")

    if not args.apply:
        print("\nDRY-RUN: no se modifico nada. Usar --apply para ejecutar.")
        src.close()
        dest.close()
        return 0

    print("\n== APLICANDO ==")
    try:
        dest.execute("BEGIN IMMEDIATE")

        cur = dest.execute(
            "DELETE FROM ScheduledScanRuns WHERE CampusKey=?", (args.campus,)
        )
        print(f"  delete ScheduledScanRuns (campus {args.campus}): {cur.rowcount}")
        cur = dest.execute(
            "DELETE FROM TelemetryScanSchedules WHERE CampusKey=?", (args.campus,)
        )
        print(f"  delete TelemetryScanSchedules (campus {args.campus}): {cur.rowcount}")
        cur = dest.execute(
            "DELETE FROM NetworkTelemetrySnapshots WHERE CampusKey=?", (args.campus,)
        )
        print(f"  delete NetworkTelemetrySnapshots (campus {args.campus}): {cur.rowcount} (cascada borra observaciones)")
        cur = dest.execute(
            "DELETE FROM NetworkTelemetryObservations WHERE NetworkTelemetrySnapshotId NOT IN "
            "(SELECT Id FROM NetworkTelemetrySnapshots)"
        )
        print(f"  delete observaciones huerfanas: {cur.rowcount}")

        n_snap, id_map = migrate_snapshots(src, dest, args.campus)
        print(f"  insert snapshots: {n_snap}")
        n_obs, missing_fk = migrate_observations(src, dest, args.campus, id_map)
        print(f"  insert observaciones: {n_obs} (sin snapshot origen: {missing_fk})")
        n_runs, unmapped_runs = migrate_scan_runs(src, dest, args.campus, id_map)
        print(f"  insert scheduled_scan_runs: {n_runs} (snapshot no mapeada -> NULL: {unmapped_runs})")
        n_sched = migrate_schedules(src, dest, args.campus)
        print(f"  insert schedules: {n_sched}")

        dest.commit()
    except Exception as exc:
        dest.rollback()
        raise SystemExit(f"ERROR: rollback ejecutado ({exc})") from exc

    final_counts = fetch_counts(dest, tables)
    print("\n== VERIFICACION DESTINO ==")
    expected = {
        "NetworkTelemetrySnapshots": src_counts["NetworkTelemetrySnapshots"],
        "NetworkTelemetryObservations": src_counts["NetworkTelemetryObservations"],
        "ScheduledScanRuns": src_counts["ScheduledScanRuns"],
        "TelemetryScanSchedules": src_counts["TelemetryScanSchedules"],
    }
    ok = True
    for t in tables:
        status = "OK" if final_counts[t] == expected[t] else "MISMATCH"
        if final_counts[t] != expected[t]:
            ok = False
        print(f"  {t}: {final_counts[t]} (esperado {expected[t]}) {status}")

    cur = dest.execute(
        "SELECT COUNT(*) FROM NetworkTelemetryObservations o "
        "LEFT JOIN NetworkTelemetrySnapshots s ON s.Id=o.NetworkTelemetrySnapshotId "
        "WHERE s.Id IS NULL"
    )
    orphans = cur.fetchone()[0]
    print(f"  observaciones huerfanas: {orphans} {'OK' if orphans == 0 else 'MISMATCH'}")
    if orphans != 0:
        ok = False

    src.close()
    dest.close()
    print("\nRESULTADO:", "EXITO" if ok else "CON DIFERENCIAS - revisar")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
