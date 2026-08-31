"""Migración de datos del campus Sotero (sotero_live.db) hacia Syntro (syntro.db).

Importa de forma idempotente (GUIDs deterministas por uuid5, INSERT OR IGNORE):

- Telemetría: último snapshot completo + sus observaciones (device/user con riesgo),
  y los resúmenes (sin observaciones) de los últimos N meses.
- Edificios: SyncedBuildings, ManualBuildings, BuildingGeometryOverrides.
- Inventario: ImportedInventoryItems, SyncedRooms, SyncedEquipments.
- Rutas peatonales: WalkingRouteNodes/Edges del campus `sotero`.
- Historial: ScheduledScanRuns (remapeando SnapshotId).

Además, limpia rutas huérfanas del campus `sca` y corrige edificios manuales
cuyo campus quedó literalmente `{getPrimaryCampusKey()}`.

Los IDs int de Sotero se convierten a GUID TEXT con un namespace por tabla para
que el remapeo de claves foráneas sea determinista y repetible.

Uso:
    python tools/migrate-sotero-to-syntro.py [--source PATH] [--target PATH]
        [--months N] [--dry-run] [--verbose]
"""

import argparse
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta

SNAP_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000001")
OBS_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000002")
SB_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000003")
MB_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000004")
BGO_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000005")
INV_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000006")
ROOM_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000007")
EQUIP_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000008")
RUN_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-000000000009")
WRN_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-00000000000a")
WRE_NS = uuid.UUID("6f9e3b1a-0000-4000-8000-00000000000b")

DEFAULT_SOURCE = r"C:\Users\paolo.vilches\AppData\Local\Temp\opencode\sotero_live.db"
DEFAULT_TARGET = "backend/data/syntro.db"

CREATED_BY = "etl"
EXPORT_USER = "migracion-sotero"


def guid(namespace, value):
    """GUID determinista (en mayúsculas, igual que EF Core + SQLite) para un id int de Sotero."""
    return str(uuid.uuid5(namespace, str(value))).upper()


def t(value, default=""):
    return default if value is None else str(value)


def i(value, default=0):
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def f(value, default=0.0):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def num(value):
    """Número nullable (None se mantiene como NULL)."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def boolflag(value):
    if value is None or value == "":
        return 0
    return 1 if int(value) != 0 else 0


def audit_columns(created_at, created_by=CREATED_BY):
    return {
        "CreatedAtUtc": created_at,
        "UpdatedAtUtc": created_at,
        "DeletedAtUtc": None,
        "CreatedBy": created_by,
        "UpdatedBy": "",
        "DeletedBy": "",
        "Version": 0,
        "IsActive": 1,
    }


def snapshot_guid(src_id):
    return guid(SNAP_NS, src_id) if src_id else None


def observation_guid(src_id):
    return guid(OBS_NS, src_id) if src_id else None


def synced_building_guid(src_id):
    return guid(SB_NS, src_id) if src_id else None


def manual_building_guid(src_id):
    return guid(MB_NS, src_id) if src_id else None


def geometry_override_guid(src_id):
    return guid(BGO_NS, src_id) if src_id else None


def inventory_item_guid(src_id):
    return guid(INV_NS, src_id) if src_id else None


def room_guid(src_id):
    return guid(ROOM_NS, src_id) if src_id else None


def equipment_guid(src_id):
    return guid(EQUIP_NS, src_id) if src_id else None


def scan_run_guid(src_id):
    return guid(RUN_NS, src_id) if src_id else None


def walking_route_node_guid(src_id):
    return guid(WRN_NS, src_id) if src_id else None


def walking_route_edge_guid(src_id):
    return guid(WRE_NS, src_id) if src_id else None


class Reporter:
    def __init__(self, verbose):
        self.verbose = verbose
        self.inserted = {}

    def note(self, table, count):
        self.inserted[table] = self.inserted.get(table, 0) + count

    def log(self, message):
        if self.verbose:
            print(message)


def iter_rows(cursor, query, params=()):
    cur = cursor.cursor()
    cur.execute(query, params)
    return cur, cur.fetchall()


def import_snapshots(src, dst, reporter, months, keep_last_payload):
    cutoff = datetime.utcnow() - timedelta(days=months * 30)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")
    last = src.execute(
        "SELECT Id, ObservedAtUtc FROM NetworkTelemetrySnapshots "
        "ORDER BY ObservedAtUtc DESC, Id DESC LIMIT 1"
    ).fetchone()
    last_id = last[0]
    last_observed = last[1]

    cur, rows = iter_rows(
        src,
        "SELECT * FROM NetworkTelemetrySnapshots WHERE ObservedAtUtc >= ? ORDER BY ObservedAtUtc DESC, Id DESC",
        (cutoff_str,),
    )
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "SourceName", "SourceType", "Status", "RiskLevel", "RiskScore",
        "DeviceCount", "ConnectedUserCount", "HighRiskDeviceCount",
        "MediumRiskDeviceCount", "LowRiskDeviceCount", "ObservedAtUtc",
        "WindowStartUtc", "WindowEndUtc", "Notes", "PayloadJson",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        src_id = data["Id"]
        is_last = src_id == last_id
        created_at = data["CreatedAtUtc"] or data["ObservedAtUtc"]
        payload = data["PayloadJson"] if (is_last and keep_last_payload) else ""
        record = {
            "Id": snapshot_guid(src_id),
            "SourceName": t(data["SourceName"]),
            "SourceType": t(data["SourceType"]),
            "Status": t(data["Status"]),
            "RiskLevel": t(data["RiskLevel"]),
            "RiskScore": i(data["RiskScore"]),
            "DeviceCount": i(data["DeviceCount"]),
            "ConnectedUserCount": i(data["ConnectedUserCount"]),
            "HighRiskDeviceCount": i(data["HighRiskDeviceCount"]),
            "MediumRiskDeviceCount": i(data["MediumRiskDeviceCount"]),
            "LowRiskDeviceCount": i(data["LowRiskDeviceCount"]),
            "ObservedAtUtc": t(data["ObservedAtUtc"]),
            "WindowStartUtc": t(data["WindowStartUtc"]) or None,
            "WindowEndUtc": t(data["WindowEndUtc"]) or None,
            "Notes": t(data["Notes"]),
            "PayloadJson": payload,
            **audit_columns(created_at, t(data["CreatedByUsername"] or EXPORT_USER)),
        }
        dst.execute(
            f"INSERT OR IGNORE INTO NetworkTelemetrySnapshots ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("NetworkTelemetrySnapshots", 1)
            reporter.log(f"  snapshot #{src_id} ({data['ObservedAtUtc']}) is_last={is_last}")

    return last_id


def import_observations(src, dst, reporter, snapshot_id):
    cur, rows = iter_rows(
        src,
        "SELECT * FROM NetworkTelemetryObservations WHERE NetworkTelemetrySnapshotId = ?",
        (snapshot_id,),
    )
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "NetworkTelemetrySnapshotId", "ObservationType", "ExternalKey",
        "DeviceName", "Username", "Domain", "IpAddress", "MacAddress",
        "SerialNumber", "HostName", "DeviceCategory", "OperatingSystem",
        "OperatingSystemVersion", "Manufacturer", "Model", "Processor",
        "MemoryGb", "DiskTotalGb", "DiskFreeGb", "LastBootAtUtc", "IsOnline",
        "DomainJoined", "IsVirtualMachine", "PingMs", "AntivirusStatus",
        "AntivirusVersion", "PatchStatus", "AgentVersion", "OpenPorts",
        "SubnetCidr", "NetworkProfile", "BuildingExternalId", "RoomExternalId",
        "ImportedInventoryItemId", "SyncedEquipmentId", "AuthUserId", "Status",
        "RiskLevel", "RiskScore", "RiskReasonsJson", "RawJson", "ObservedAtUtc",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        created_at = data["CreatedAtUtc"] or data["ObservedAtUtc"]
        record = {
            "Id": observation_guid(data["Id"]),
            "NetworkTelemetrySnapshotId": snapshot_guid(data["NetworkTelemetrySnapshotId"]),
            "ObservationType": t(data["ObservationType"], "device"),
            "ExternalKey": t(data["ExternalKey"]),
            "DeviceName": t(data["DeviceName"]),
            "Username": t(data["Username"]),
            "Domain": t(data["Domain"]),
            "IpAddress": t(data["IpAddress"]),
            "MacAddress": t(data["MacAddress"]),
            "SerialNumber": t(data["SerialNumber"]),
            "HostName": t(data["HostName"]),
            "DeviceCategory": t(data["DeviceCategory"]),
            "OperatingSystem": t(data["OperatingSystem"]),
            "OperatingSystemVersion": t(data["OperatingSystemVersion"]),
            "Manufacturer": t(data["Manufacturer"]),
            "Model": t(data["Model"]),
            "Processor": t(data["Processor"]),
            "MemoryGb": num(data["MemoryGb"]),
            "DiskTotalGb": num(data["DiskTotalGb"]),
            "DiskFreeGb": num(data["DiskFreeGb"]),
            "LastBootAtUtc": t(data["LastBootAtUtc"]) or None,
            "IsOnline": data["IsOnline"],
            "DomainJoined": data["DomainJoined"],
            "IsVirtualMachine": data["IsVirtualMachine"],
            "PingMs": num(data["PingMs"]),
            "AntivirusStatus": t(data["AntivirusStatus"]),
            "AntivirusVersion": t(data["AntivirusVersion"]),
            "PatchStatus": t(data["PatchStatus"]),
            "AgentVersion": t(data["AgentVersion"]),
            "OpenPorts": t(data["OpenPorts"]),
            "SubnetCidr": t(data["SubnetCidr"]),
            "NetworkProfile": t(data["NetworkProfile"]),
            "BuildingExternalId": t(data["BuildingExternalId"]),
            "RoomExternalId": t(data["RoomExternalId"]),
            "ImportedInventoryItemId": inventory_item_guid(data["ImportedInventoryItemId"]),
            "SyncedEquipmentId": equipment_guid(data["SyncedEquipmentId"]),
            "AuthUserId": guid(OBS_NS, data["AuthUserId"]) if data["AuthUserId"] else None,
            "Status": t(data["Status"], "observed"),
            "RiskLevel": t(data["RiskLevel"], "low"),
            "RiskScore": i(data["RiskScore"]),
            "RiskReasonsJson": t(data["RiskReasonsJson"], "[]"),
            "RawJson": t(data["RawJson"], "{}"),
            "ObservedAtUtc": t(data["ObservedAtUtc"]),
            **audit_columns(created_at, EXPORT_USER),
        }
        dst.execute(
            f"INSERT OR IGNORE INTO NetworkTelemetryObservations ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("NetworkTelemetryObservations", 1)


def import_synced_buildings(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM SyncedBuildings")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "Campus", "ManualCampus", "Slug", "DisplayName",
        "ManualDisplayName", "ShortName", "RealName", "Type", "ResponsibleArea",
        "Notes", "SourceId", "CentroidLatitude", "CentroidLongitude",
        "HasInteriorMap", "HasInventory", "MappingStatus", "InventoryStatus",
        "OperationalNotes", "TechnicalNotes", "LastUpdate", "FloorsJson",
        "ManualFloorsJson", "FloorSummariesJson", "TagsJson", "ContactsJson",
        "SyncedAtUtc", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive", "IsDeleted",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        synced_at = t(data["SyncedAtUtc"]) or datetime.utcnow().isoformat()
        is_deleted = boolflag(data["IsDeleted"])
        record = {
            "Id": synced_building_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "Campus": t(data["Campus"], "sotero"),
            "ManualCampus": "",
            "Slug": t(data["Slug"]),
            "DisplayName": t(data["DisplayName"]),
            "ManualDisplayName": "",
            "ShortName": t(data["ShortName"]),
            "RealName": t(data["RealName"]),
            "Type": t(data["Type"]),
            "ResponsibleArea": t(data["ResponsibleArea"]),
            "Notes": t(data["Notes"]),
            "SourceId": t(data["SourceId"], "etl"),
            "CentroidLatitude": f(data["CentroidLatitude"]),
            "CentroidLongitude": f(data["CentroidLongitude"]),
            "HasInteriorMap": boolflag(data["HasInteriorMap"]),
            "HasInventory": boolflag(data["HasInventory"]),
            "MappingStatus": t(data["MappingStatus"]),
            "InventoryStatus": t(data["InventoryStatus"]),
            "OperationalNotes": t(data["OperationalNotes"]),
            "TechnicalNotes": t(data["TechnicalNotes"]),
            "LastUpdate": t(data["LastUpdate"]),
            "FloorsJson": t(data["FloorsJson"]),
            "ManualFloorsJson": "",
            "FloorSummariesJson": t(data["FloorSummariesJson"], "[]"),
            "TagsJson": t(data["TagsJson"], "[]"),
            "ContactsJson": t(data["ContactsJson"], "[]"),
            "SyncedAtUtc": synced_at,
            "IsDeleted": is_deleted,
            **audit_columns(synced_at),
        }
        record["IsActive"] = 0 if is_deleted else 1
        dst.execute(
            f"INSERT OR IGNORE INTO SyncedBuildings ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("SyncedBuildings", 1)


def import_manual_buildings(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM ManualBuildings")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "Campus", "DisplayName", "Type", "Notes",
        "FloorsJson", "GeometryJson", "CentroidLatitude", "CentroidLongitude",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        created_at = data["CreatedAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": manual_building_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "Campus": t(data["Campus"], "sotero"),
            "DisplayName": t(data["DisplayName"]),
            "Type": t(data["Type"], "manual"),
            "Notes": t(data["Notes"]),
            "FloorsJson": t(data["FloorsJson"], "[]"),
            "GeometryJson": t(data["GeometryJson"]),
            "CentroidLatitude": f(data["CentroidLatitude"]),
            "CentroidLongitude": f(data["CentroidLongitude"]),
            "CreatedBy": t(data["CreatedByUsername"] or CREATED_BY),
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": created_at,
            "UpdatedAtUtc": data["UpdatedAtUtc"] or created_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO ManualBuildings ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("ManualBuildings", 1)


def import_geometry_overrides(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM BuildingGeometryOverrides")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "BuildingExternalId", "GeometryJson", "CentroidLatitude",
        "CentroidLongitude", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        updated_at = data["UpdatedAtUtc"] or datetime.utcnow().isoformat()
        user = t(data["UpdatedByUsername"] or CREATED_BY)
        record = {
            "Id": geometry_override_guid(data["Id"]),
            "BuildingExternalId": t(data["BuildingExternalId"]),
            "GeometryJson": t(data["GeometryJson"]),
            "CentroidLatitude": f(data["CentroidLatitude"]),
            "CentroidLongitude": f(data["CentroidLongitude"]),
            "CreatedBy": user,
            "UpdatedBy": user,
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": updated_at,
            "UpdatedAtUtc": updated_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO BuildingGeometryOverrides ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("BuildingGeometryOverrides", 1)


def import_inventory_items(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM ImportedInventoryItems")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "RowNumber", "ItemNumber", "SerialNumber", "Description", "Lot",
        "InstallDate", "UnitOrDepartment", "OrganizationalUnit",
        "ResponsibleUser", "Run", "Email", "JobTitle", "IpAddress", "MacAddress",
        "AnnexPhone", "ReplacedEquipment", "TicketMda", "Installer",
        "Observation", "Rut", "InventoryDate", "InferredCategory",
        "InferredStatus", "MatchedSyncedBuildingId", "MatchedSyncedRoomId",
        "MatchedBuildingExternalId", "MatchedRoomExternalId", "MatchConfidence",
        "MatchNotes", "AssignedBuildingExternalId", "AssignedRoomExternalId",
        "AssignedFloor", "AssignmentNotes", "AssignmentUpdatedAtUtc",
        "DeliveryFormPdfFileName", "SourceFile", "ImportedAtUtc",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        imported_at = data["ImportedAtUtc"] or datetime.utcnow().isoformat()
        updated_at = data["AssignmentUpdatedAtUtc"] or imported_at
        record = {
            "Id": inventory_item_guid(data["Id"]),
            "RowNumber": i(data["RowNumber"]),
            "ItemNumber": t(data["ItemNumber"]),
            "SerialNumber": t(data["SerialNumber"]),
            "Description": t(data["Description"]),
            "Lot": t(data["Lot"]),
            "InstallDate": t(data["InstallDate"]),
            "UnitOrDepartment": t(data["UnitOrDepartment"]),
            "OrganizationalUnit": t(data["OrganizationalUnit"]),
            "ResponsibleUser": t(data["ResponsibleUser"]),
            "Run": t(data["Run"]),
            "Email": t(data["Email"]),
            "JobTitle": t(data["JobTitle"]),
            "IpAddress": t(data["IpAddress"]),
            "MacAddress": t(data["MacAddress"]),
            "AnnexPhone": t(data["AnnexPhone"]),
            "ReplacedEquipment": t(data["ReplacedEquipment"]),
            "TicketMda": t(data["TicketMda"]),
            "Installer": t(data["Installer"]),
            "Observation": t(data["Observation"]),
            "Rut": t(data["Rut"]),
            "InventoryDate": t(data["InventoryDate"]),
            "InferredCategory": t(data["InferredCategory"]),
            "InferredStatus": t(data["InferredStatus"]),
            "MatchedSyncedBuildingId": synced_building_guid(data["MatchedSyncedBuildingId"]),
            "MatchedSyncedRoomId": room_guid(data["MatchedSyncedRoomId"]),
            "MatchedBuildingExternalId": t(data["MatchedBuildingExternalId"]),
            "MatchedRoomExternalId": t(data["MatchedRoomExternalId"]),
            "MatchConfidence": t(data["MatchConfidence"]),
            "MatchNotes": t(data["MatchNotes"]),
            "AssignedBuildingExternalId": t(data["AssignedBuildingExternalId"]),
            "AssignedRoomExternalId": t(data["AssignedRoomExternalId"]),
            "AssignedFloor": i(data["AssignedFloor"]),
            "AssignmentNotes": t(data["AssignmentNotes"]),
            "AssignmentUpdatedAtUtc": t(data["AssignmentUpdatedAtUtc"]) or None,
            "DeliveryFormPdfFileName": t(data["DeliveryFormPdfFileName"]),
            "SourceFile": t(data["SourceFile"]),
            "ImportedAtUtc": imported_at,
            "CreatedBy": EXPORT_USER,
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": imported_at,
            "UpdatedAtUtc": updated_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO ImportedInventoryItems ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("ImportedInventoryItems", 1)


def import_synced_rooms(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM SyncedRooms")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "SyncedBuildingId", "BuildingExternalId", "Floor",
        "ManualFloor", "Name", "ManualName", "ShortName", "Type", "Sector",
        "Unit", "Service", "IsMapped", "GeometryJson", "Status", "Capacity",
        "DevicesCount", "ResponsibleArea", "ResponsiblePerson", "Notes",
        "SyncedAtUtc", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        synced_at = data["SyncedAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": room_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "SyncedBuildingId": synced_building_guid(data["SyncedBuildingId"]),
            "BuildingExternalId": t(data["BuildingExternalId"]),
            "Floor": i(data["Floor"]),
            "ManualFloor": i(data["ManualFloor"]),
            "Name": t(data["Name"]),
            "ManualName": t(data["ManualName"]),
            "ShortName": t(data["ShortName"]),
            "Type": t(data["Type"]),
            "Sector": t(data["Sector"]),
            "Unit": t(data["Unit"]),
            "Service": t(data["Service"]),
            "IsMapped": boolflag(data["IsMapped"]),
            "GeometryJson": t(data["GeometryJson"]),
            "Status": t(data["Status"]),
            "Capacity": i(data["Capacity"]),
            "DevicesCount": i(data["DevicesCount"]),
            "ResponsibleArea": t(data["ResponsibleArea"]),
            "ResponsiblePerson": t(data["ResponsiblePerson"]),
            "Notes": t(data["Notes"]),
            "SyncedAtUtc": synced_at,
            "CreatedBy": EXPORT_USER,
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": synced_at,
            "UpdatedAtUtc": synced_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO SyncedRooms ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("SyncedRooms", 1)


def import_synced_equipments(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM SyncedEquipments")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "SyncedBuildingId", "SyncedRoomId",
        "BuildingExternalId", "RoomExternalId", "Floor", "Type", "Subtype",
        "Name", "InventoryCode", "SerialNumber", "Brand", "Model", "IpAddress",
        "MacAddress", "AssignedTo", "ResponsiblePerson", "Status",
        "NetworkStatus", "LastSeen", "PurchaseDate", "Notes", "HistoryJson",
        "Source", "SyncedAtUtc", "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        synced_at = data["SyncedAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": equipment_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "SyncedBuildingId": synced_building_guid(data["SyncedBuildingId"]),
            "SyncedRoomId": room_guid(data["SyncedRoomId"]),
            "BuildingExternalId": t(data["BuildingExternalId"]),
            "RoomExternalId": t(data["RoomExternalId"]),
            "Floor": i(data["Floor"]),
            "Type": t(data["Type"]),
            "Subtype": t(data["Subtype"]),
            "Name": t(data["Name"]),
            "InventoryCode": t(data["InventoryCode"]),
            "SerialNumber": t(data["SerialNumber"]),
            "Brand": t(data["Brand"]),
            "Model": t(data["Model"]),
            "IpAddress": t(data["IpAddress"]),
            "MacAddress": t(data["MacAddress"]),
            "AssignedTo": t(data["AssignedTo"]),
            "ResponsiblePerson": t(data["ResponsiblePerson"]),
            "Status": t(data["Status"]),
            "NetworkStatus": t(data["NetworkStatus"]),
            "LastSeen": t(data["LastSeen"]),
            "PurchaseDate": t(data["PurchaseDate"]),
            "Notes": t(data["Notes"]),
            "HistoryJson": t(data["HistoryJson"], "[]"),
            "Source": t(data["Source"], "etl"),
            "SyncedAtUtc": synced_at,
            "CreatedBy": EXPORT_USER,
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": synced_at,
            "UpdatedAtUtc": synced_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO SyncedEquipments ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("SyncedEquipments", 1)


def import_scan_runs(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM ScheduledScanRuns")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ScheduledAtUtc", "StartedAtUtc", "CompletedAtUtc", "Status",
        "ErrorMessage", "SnapshotId", "ScheduledTimeLocal", "ScheduledDayLocal",
        "DeviceCount", "UserCount", "NormalizedCron", "CreatedAtUtc",
        "UpdatedAtUtc", "DeletedAtUtc", "CreatedBy", "UpdatedBy", "DeletedBy",
        "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        created_at = data["CreatedAtUtc"] or data["ScheduledAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": scan_run_guid(data["Id"]),
            "ScheduledAtUtc": t(data["ScheduledAtUtc"]),
            "StartedAtUtc": t(data["StartedAtUtc"]) or None,
            "CompletedAtUtc": t(data["CompletedAtUtc"]) or None,
            "Status": t(data["Status"], "completed"),
            "ErrorMessage": t(data["ErrorMessage"]) or None,
            "SnapshotId": snapshot_guid(data["SnapshotId"]),
            "ScheduledTimeLocal": t(data["ScheduledTimeLocal"]),
            "ScheduledDayLocal": t(data["ScheduledDayLocal"]),
            "DeviceCount": i(data["DeviceCount"]),
            "UserCount": i(data["UserCount"]),
            "NormalizedCron": t(data["NormalizedCron"]),
            "CreatedBy": EXPORT_USER,
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": created_at,
            "UpdatedAtUtc": created_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO ScheduledScanRuns ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("ScheduledScanRuns", 1)


def import_walking_route_nodes(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM WalkingRouteNodes")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "Campus", "Latitude", "Longitude", "Notes",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        created_at = data["CreatedAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": walking_route_node_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "Campus": t(data["Campus"], "sotero"),
            "Latitude": f(data["Latitude"]),
            "Longitude": f(data["Longitude"]),
            "Notes": t(data["Notes"]),
            "CreatedBy": t(data["CreatedByUsername"] or CREATED_BY),
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": created_at,
            "UpdatedAtUtc": data["UpdatedAtUtc"] or created_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO WalkingRouteNodes ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("WalkingRouteNodes", 1)


def import_walking_route_edges(src, dst, reporter):
    cur, rows = iter_rows(src, "SELECT * FROM WalkingRouteEdges")
    cols = [c[0] for c in cur.description]

    keys = [
        "Id", "ExternalId", "Campus", "FromNodeExternalId", "ToNodeExternalId",
        "DistanceMeters", "Status", "Notes",
        "CreatedAtUtc", "UpdatedAtUtc", "DeletedAtUtc",
        "CreatedBy", "UpdatedBy", "DeletedBy", "Version", "IsActive",
    ]

    for row in rows:
        data = dict(zip(cols, row))
        created_at = data["CreatedAtUtc"] or datetime.utcnow().isoformat()
        record = {
            "Id": walking_route_edge_guid(data["Id"]),
            "ExternalId": t(data["ExternalId"]),
            "Campus": t(data["Campus"], "sotero"),
            "FromNodeExternalId": t(data["FromNodeExternalId"]),
            "ToNodeExternalId": t(data["ToNodeExternalId"]),
            "DistanceMeters": f(data["DistanceMeters"]),
            "Status": t(data["Status"], "open"),
            "Notes": t(data["Notes"]),
            "CreatedBy": t(data["CreatedByUsername"] or CREATED_BY),
            "UpdatedBy": "",
            "DeletedBy": "",
            "Version": 0,
            "IsActive": 1,
            "CreatedAtUtc": created_at,
            "UpdatedAtUtc": data["UpdatedAtUtc"] or created_at,
            "DeletedAtUtc": None,
        }
        dst.execute(
            f"INSERT OR IGNORE INTO WalkingRouteEdges ({','.join(keys)}) "
            f"VALUES ({','.join('?' for _ in keys)})",
            [record[k] for k in keys],
        )
        if dst.total_changes:
            reporter.note("WalkingRouteEdges", 1)


def cleanup_orphan_routes(dst, reporter):
    """Borra rutas peatonales huérfanas del campus `sca` (datos de prueba) y
    corrige edificios manuales cuyo campus quedó literalmente `{getPrimaryCampusKey()}`."""
    edges = dst.execute(
        "DELETE FROM WalkingRouteEdges WHERE Campus = 'sca'"
    ).rowcount
    nodes = dst.execute(
        "DELETE FROM WalkingRouteNodes WHERE Campus = 'sca'"
    ).rowcount
    if edges:
        reporter.note("WalkingRouteEdges(limpieza sca)", edges)
    if nodes:
        reporter.note("WalkingRouteNodes(limpieza sca)", nodes)
    fixed = dst.execute(
        "UPDATE ManualBuildings SET Campus = 'sotero', UpdatedBy = 'etl' "
        "WHERE Campus = '{getPrimaryCampusKey()}'"
    ).rowcount
    if fixed:
        reporter.note("ManualBuildings(campus corregido)", fixed)
    if edges or nodes or fixed:
        print(f"[cleanup] rutas sca eliminadas: {edges} edges / {nodes} nodes; edificios corregidos: {fixed}")


def reset_imported(src, dst, reporter):
    """Elimina las filas previamente importadas por este ETL, preservando los datos preexistentes."""
    print("[reset] limpiando filas previamente importadas...")
    snap_ids = [guid(SNAP_NS, r[0]) for r in src.execute("SELECT Id FROM NetworkTelemetrySnapshots")]
    placeholders = ",".join("?" * len(snap_ids))
    dst.execute(
        f"DELETE FROM NetworkTelemetrySnapshots WHERE UPPER(Id) IN ({placeholders})", snap_ids
    )
    dst.execute("DELETE FROM NetworkTelemetryObservations WHERE CreatedBy = 'migracion-sotero'")
    dst.execute("DELETE FROM BuildingGeometryOverrides WHERE CreatedBy = 'admin'")
    dst.execute("DELETE FROM SyncedRooms WHERE CreatedBy = 'migracion-sotero'")
    dst.execute("DELETE FROM SyncedEquipments WHERE CreatedBy = 'migracion-sotero'")
    dst.execute("DELETE FROM ImportedInventoryItems WHERE CreatedBy = 'migracion-sotero'")
    dst.execute("DELETE FROM ScheduledScanRuns WHERE CreatedBy = 'migracion-sotero'")
    dst.execute("DELETE FROM SyncedBuildings WHERE CreatedBy = 'etl'")
    dst.execute("DELETE FROM ManualBuildings WHERE CreatedBy = 'admin'")
    print("[reset] listo.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="SQLite de origen (Sotero)")
    parser.add_argument("--target", default=DEFAULT_TARGET, help="SQLite de destino (Syntro)")
    parser.add_argument("--months", type=int, default=12, help="Meses de resúmenes de snapshots a importar")
    parser.add_argument("--dry-run", action="store_true", help="Solo reportar sin escribir")
    parser.add_argument("--reset", action="store_true", help="Borrar filas previamente importadas antes de importar")
    parser.add_argument("--verbose", action="store_true", help="Detalle por fila")
    args = parser.parse_args()

    src = sqlite3.connect(args.source)
    dst = sqlite3.connect(args.target)
    reporter = Reporter(args.verbose)

    try:
        dst.execute("BEGIN")
        if args.reset:
            reset_imported(src, dst, reporter)
        if args.dry_run:
            print("[dry-run] no se escribirá nada en el destino (transacción se revertirá).")

        last_snapshot_id = import_snapshots(
            src, dst, reporter, args.months, keep_last_payload=not args.dry_run
        )
        if last_snapshot_id:
            import_observations(src, dst, reporter, last_snapshot_id)
        import_synced_buildings(src, dst, reporter)
        import_manual_buildings(src, dst, reporter)
        import_geometry_overrides(src, dst, reporter)
        import_synced_rooms(src, dst, reporter)
        import_synced_equipments(src, dst, reporter)
        import_inventory_items(src, dst, reporter)
        import_scan_runs(src, dst, reporter)
        import_walking_route_nodes(src, dst, reporter)
        import_walking_route_edges(src, dst, reporter)
        cleanup_orphan_routes(dst, reporter)

        if not args.dry_run:
            dst.commit()
        else:
            dst.rollback()
    except Exception:
        dst.rollback()
        raise
    finally:
        src.close()
        dst.close()

    print("\nResumen de importación:")
    tables = [
        "NetworkTelemetrySnapshots", "NetworkTelemetryObservations",
        "SyncedBuildings", "ManualBuildings", "BuildingGeometryOverrides",
        "SyncedRooms", "SyncedEquipments", "ImportedInventoryItems",
        "ScheduledScanRuns", "WalkingRouteNodes", "WalkingRouteEdges",
        "WalkingRouteNodes(limpieza sca)", "WalkingRouteEdges(limpieza sca)",
        "ManualBuildings(campus corregido)",
    ]
    for table in tables:
        print(f"  {table}: {reporter.inserted.get(table, 0)}")


if __name__ == "__main__":
    sys.exit(main())
