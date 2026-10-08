#!/usr/bin/env python3
"""Asignacion masiva de inventario a los sectores creados en el mapa.

Reglas:
  1. Objetivo: PCs + impresoras + equipos 'other' cuyo SerialNumber no sea
     "No Retirado" (esos 5 quedan en 'other' y sin asignar). Los 'other' del
     objetivo se reclasifican a 'pc' antes de asignar.
  2. Prioridad de asignacion: coincidencia por sector o por edificio
     (asignacion previa valida, sugerencias Matched*, aliases y texto).
  3. Sin coincidencia (0%): asignacion proporcional al tamanio del edificio
     (huella geometrica) y luego proporcional al tamanio de cada sector.
  4. Toda meta se asigna una unica vez y todo sector activo queda con >= 1
     equipo asignado.

Uso:
  python tools/assign_inventory_to_sectors.py --db <ruta/syntro.db>          # plan (solo lectura)
  python tools/assign_inventory_to_sectors.py --db <ruta/syntro.db> --apply  # aplica y verifica
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

FRONTEND_DATA_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
MAX_NOTES_LEN = 500
NO_RETIRADO = "no retirado"


def normalize(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFD", value)
    kept = [
        ch.upper()
        for ch in decomposed
        if unicodedata.category(ch) != "Mn" and (ch.isalnum() or ch.isspace())
    ]
    return " ".join("".join(kept).split())


def text_matches(left: str, right: str) -> bool:
    if not left or not right:
        return False
    return left == right or left in right or right in left


def polygon_area_m2(geometry_json: str | None) -> float:
    if not geometry_json:
        return 0.0
    try:
        geometry = json.loads(geometry_json)
    except (ValueError, TypeError):
        return 0.0

    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        polygons = [geometry.get("coordinates") or []]
    elif geometry_type == "MultiPolygon":
        polygons = geometry.get("coordinates") or []
    else:
        return 0.0

    total = 0.0
    for rings in polygons:
        if not rings:
            continue
        ring = rings[0]
        if not ring or len(ring) < 4:
            continue
        lat_avg = sum(point[1] for point in ring) / len(ring)
        m_per_deg_lat = 110540.0
        m_per_deg_lon = 111320.0 * math.cos(math.radians(lat_avg))
        signed = 0.0
        for index in range(len(ring)):
            x1 = ring[index][0] * m_per_deg_lon
            y1 = ring[index][1] * m_per_deg_lat
            x2 = ring[(index + 1) % len(ring)][0] * m_per_deg_lon
            y2 = ring[(index + 1) % len(ring)][1] * m_per_deg_lat
            signed += x1 * y2 - x2 * y1
        total += abs(signed) / 2.0
    return total


def largest_remainder(total: int, weights: list[float]) -> list[int]:
    if total < 0 or not weights:
        raise ValueError("pesos invalidos para distribucion")
    weight_sum = sum(weights)
    if weight_sum <= 0:
        base = total // len(weights)
        result = [base] * len(weights)
        result[0] += total - base * len(weights)
        return result
    raw = [total * weight / weight_sum for weight in weights]
    base = [int(value) for value in raw]
    remainder = total - sum(base)
    order = sorted(
        range(len(weights)),
        key=lambda index: raw[index] - base[index],
        reverse=True,
    )
    for index in order[:remainder]:
        base[index] += 1
    return base


def load_building_geometry(
    conn: sqlite3.Connection, building_id: str, sector_floors: list[int]
) -> tuple[float, str]:
    row = conn.execute(
        """
        SELECT GeometryJson FROM BuildingGeometryOverrides
        WHERE BuildingExternalId = ? AND DeletedAtUtc IS NULL AND IsActive = 1
        ORDER BY UpdatedAtUtc DESC LIMIT 1
        """,
        (building_id,),
    ).fetchone()
    if row and row[0]:
        area = polygon_area_m2(row[0])
        if area > 0:
            return area, "geometry-override"

    row = conn.execute(
        """
        SELECT GeometryJson FROM ManualBuildings
        WHERE ExternalId = ? AND DeletedAtUtc IS NULL
        """,
        (building_id,),
    ).fetchone()
    if row and row[0]:
        area = polygon_area_m2(row[0])
        if area > 0:
            return area, "manual-building"

    if FRONTEND_DATA_DIR.is_dir():
        floors = sorted({floor for floor in sector_floors if floor} or [1])
        floors = [1] + [floor for floor in floors if floor != 1]
        for floor in floors:
            for geo_file in sorted(FRONTEND_DATA_DIR.glob(f"*_{floor}.json")):
                try:
                    data = json.loads(geo_file.read_text(encoding="utf-8"))
                except ValueError:
                    continue
                for feature in data.get("features", []):
                    if (feature.get("properties") or {}).get("id") == building_id:
                        area = polygon_area_m2(json.dumps(feature.get("geometry")))
                        if area > 0:
                            return area, f"frontend:{geo_file.name}"
    return 0.0, "sin-geometria"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="Ruta al archivo syntro.db")
    parser.add_argument("--apply", action="store_true", help="Escribe los cambios")
    parser.add_argument("--report", help="Ruta opcional para el reporte JSON")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: no existe la base {db_path}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    keep_other = conn.execute(
        """
        SELECT COUNT(*) FROM ImportedInventoryItems
        WHERE InferredCategory = 'other' AND lower(trim(SerialNumber)) = ?
        """,
        (NO_RETIRADO,),
    ).fetchone()[0]
    reclassify_count = conn.execute(
        """
        SELECT COUNT(*) FROM ImportedInventoryItems
        WHERE InferredCategory = 'other' AND lower(trim(SerialNumber)) <> ?
        """,
        (NO_RETIRADO,),
    ).fetchone()[0]

    sectors_rows = conn.execute(
        """
        SELECT ExternalId, BuildingExternalId, Floor, DisplayName, Unit, Service, GeometryJson
        FROM ManualRooms
        WHERE DeletedAtUtc IS NULL AND lower(Type) = 'sector'
        ORDER BY BuildingExternalId, ExternalId
        """
    ).fetchall()
    if not sectors_rows:
        print("ERROR: no hay sectores manuales activos.", file=sys.stderr)
        return 2

    sectors = []
    for row in sectors_rows:
        sectors.append(
            {
                "id": row["ExternalId"],
                "building": row["BuildingExternalId"],
                "floor": row["Floor"],
                "name": row["DisplayName"] or "",
                "unit": row["Unit"] or "",
                "service": row["Service"] or "",
                "area": polygon_area_m2(row["GeometryJson"]),
            }
        )
    sector_by_id = {sector["id"]: sector for sector in sectors}
    buildings = sorted({sector["building"] for sector in sectors})
    if not buildings:
        print("ERROR: los sectores no apuntan a edificios validos.", file=sys.stderr)
        return 2

    building_info = {}
    for building_id in buildings:
        floors = [s["floor"] for s in sectors if s["building"] == building_id]
        area, source = load_building_geometry(conn, building_id, floors)
        if area <= 0:
            area = sum(
                s["area"] for s in sectors if s["building"] == building_id
            )
            source = "suma-de-sectores"
        building_info[building_id] = {
            "area": area,
            "source": source,
            "sectors": [s["id"] for s in sectors if s["building"] == building_id],
        }

    alias_rules = {}
    try:
        for row in conn.execute(
            "SELECT * FROM InventoryAliasRules WHERE IsEnabled = 1"
        ):
            keys = row.keys()
            if "NormalizedSourceText" in keys and "TargetBuildingExternalId" in keys:
                alias_rules[row["NormalizedSourceText"] if row["NormalizedSourceText"] else normalize(row["SourceText"])] = {
                    "building": row["TargetBuildingExternalId"],
                    "room": row["TargetRoomExternalId"] if "TargetRoomExternalId" in keys else "",
                }
    except sqlite3.Error as exc:  # pragma: no cover
        print(f"AVISO: no se pudieron leer alias ({exc}).", file=sys.stderr)

    if args.apply:
        conn.execute("BEGIN IMMEDIATE")

    if reclassify_count and args.apply:
        conn.execute(
            """
            UPDATE ImportedInventoryItems
            SET InferredCategory = 'pc'
            WHERE InferredCategory = 'other' AND lower(trim(SerialNumber)) <> ?
            """,
            (NO_RETIRADO,),
        )

    target_rows = conn.execute(
        """
        SELECT Id, RowNumber, OrganizationalUnit, UnitOrDepartment, ResponsibleUser,
               Description, InferredCategory, SerialNumber, IsActive,
               MatchedBuildingExternalId, MatchedRoomExternalId, MatchConfidence,
               AssignedRoomExternalId
        FROM ImportedInventoryItems
        WHERE DeletedAtUtc IS NULL
          AND (InferredCategory IN ('pc', 'printer')
               OR (InferredCategory = 'other' AND lower(trim(SerialNumber)) <> ?))
        ORDER BY RowNumber, Id
        """,
        (NO_RETIRADO,),
    ).fetchall()

    buildings_norm = {}
    for building_id in buildings:
        rows = conn.execute(
            """
            SELECT DisplayName, RealName, ResponsibleArea, ShortName
            FROM SyncedBuildings WHERE ExternalId = ?
            """,
            (building_id,),
        ).fetchone()
        if rows is None:
            rows = conn.execute(
                "SELECT DisplayName, '', '', ShortName FROM ManualBuildings WHERE ExternalId = ?",
                (building_id,),
            ).fetchone()
        if rows is None:
            buildings_norm[building_id] = []
            continue
        buildings_norm[building_id] = [
            normalize(rows[0]),
            normalize(rows[1]),
            normalize(rows[2]),
            normalize(rows[3]),
        ]

    assignments = []
    stats = {"sector": 0, "building": 0, "unmatched": 0, "reassigned": 0}
    match_details = []

    for item in target_rows:
        candidates = [
            value
            for value in (
                item["OrganizationalUnit"],
                item["UnitOrDepartment"],
                item["ResponsibleUser"],
            )
            if value and value.strip()
        ]
        normalized_candidates = [
            normalize(value) for value in candidates if normalize(value)
        ]

        label = None
        detail = ""
        matched_sector = None
        matched_building = None

        previous_room = item["AssignedRoomExternalId"] or ""
        if previous_room and previous_room in sector_by_id:
            matched_sector = previous_room
            matched_building = sector_by_id[previous_room]["building"]
            label = "asignacion previa"
            detail = previous_room
        elif (
            item["MatchedRoomExternalId"]
            and item["MatchedRoomExternalId"] in sector_by_id
        ):
            matched_sector = item["MatchedRoomExternalId"]
            matched_building = sector_by_id[matched_sector]["building"]
            label = "coincidencia por sector (sugerencia)"
            detail = item["MatchConfidence"] or "sugerencia"
        elif (
            item["MatchedBuildingExternalId"]
            and item["MatchedBuildingExternalId"] in building_info
        ):
            matched_building = item["MatchedBuildingExternalId"]
            label = "coincidencia por edificio (sugerencia)"
            detail = item["MatchConfidence"] or "sugerencia"
        else:
            for rule_key, rule in alias_rules.items():
                if rule["building"] not in building_info:
                    continue
                if any(rule_key == candidate for candidate in normalized_candidates):
                    matched_building = rule["building"]
                    if rule.get("room") in sector_by_id:
                        matched_sector = rule["room"]
                        label = "coincidencia por sector (alias)"
                    else:
                        label = "coincidencia por edificio (alias)"
                    detail = rule_key
                    break

            if label is None:
                for building_id in buildings:
                    norms = buildings_norm.get(building_id, [])
                    for candidate in normalized_candidates:
                        if any(text_matches(candidate, norm) for norm in norms if norm):
                            matched_building = building_id
                            label = "coincidencia por edificio (texto)"
                            detail = candidate
                            break
                    if matched_building:
                        break

            if label is None:
                for sector in sectors:
                    sector_texts = [
                        normalize(sector["name"]),
                        normalize(sector["unit"]),
                        normalize(sector["service"]),
                    ]
                    for candidate in normalized_candidates:
                        if any(
                            text_matches(candidate, text)
                            for text in sector_texts
                            if text
                        ):
                            matched_sector = sector["id"]
                            matched_building = sector["building"]
                            label = "coincidencia por sector (texto)"
                            detail = candidate
                            break
                    if matched_sector:
                        break

        if label is None:
            stats["unmatched"] += 1
            kind = "unmatched"
        elif matched_sector:
            stats["sector"] += 1
            kind = "sector"
        else:
            stats["building"] += 1
            kind = "building"

        if previous_room and previous_room in sector_by_id and matched_sector != previous_room:
            stats["reassigned"] += 1

        if kind != "unmatched":
            match_details.append(
                {
                    "item": item["Id"],
                    "row": item["RowNumber"],
                    "category": item["InferredCategory"],
                    "kind": kind,
                    "label": label,
                    "detail": detail,
                    "building": matched_building,
                    "sector": matched_sector,
                }
            )

        assignments.append(
            {
                "id": item["Id"],
                "row": item["RowNumber"],
                "kind": kind,
                "label": label or "",
                "detail": detail or "",
                "sector": matched_sector,
                "building": matched_building,
            }
        )

    total = len(assignments)
    if total == 0:
        print("ERROR: no hay equipos objetivo en la base.", file=sys.stderr)
        return 2

    pinned_sector_counts = {sector["id"]: 0 for sector in sectors}
    building_pinned_counts = {building_id: 0 for building_id in buildings}
    for entry in assignments:
        if entry["kind"] == "sector":
            pinned_sector_counts[entry["sector"]] += 1
        elif entry["kind"] == "building":
            building_pinned_counts[entry["building"]] += 1

    unmatched_count = stats["unmatched"]
    building_weights = [max(building_info[b]["area"], 0.001) for b in buildings]
    unmatched_shares = dict(
        zip(buildings, largest_remainder(unmatched_count, building_weights))
    )

    quotas = {}
    free_counts = {}
    for building_id in buildings:
        pinned_total = building_pinned_counts[building_id] + sum(
            pinned_sector_counts[sid]
            for sid in building_info[building_id]["sectors"]
        )
        quota = pinned_total + unmatched_shares[building_id]
        quotas[building_id] = quota
        building_sector_ids = building_info[building_id]["sectors"]
        free = quota - sum(pinned_sector_counts[sid] for sid in building_sector_ids)
        if free < 0:
            print(
                f"ERROR: cuota negativa en {building_id} "
                f"(cuota={quota}, fijos={quota - free}).",
                file=sys.stderr,
            )
            return 2
        required = [
            max(0, 1 - pinned_sector_counts[sid]) for sid in building_sector_ids
        ]
        if sum(required) > free:
            print(
                f"ERROR: no alcanza para garantizar 1 equipo por sector en {building_id} "
                f"(libres={free}, requeridos={sum(required)}).",
                file=sys.stderr,
            )
            return 2
        sector_areas = [
            max(
                next(s["area"] for s in sectors if s["id"] == sid),
                0.001,
            )
            for sid in building_sector_ids
        ]
        extra = largest_remainder(free - sum(required), sector_areas)
        free_counts[building_id] = {
            sid: required[index] + extra[index]
            for index, sid in enumerate(building_sector_ids)
        }

    unmatched_entries = sorted(
        (entry for entry in assignments if entry["kind"] == "unmatched"),
        key=lambda e: (e["row"], e["id"]),
    )
    if len(unmatched_entries) != unmatched_count:
        print("ERROR: conteo inconsistente de equipos sin coincidencia.", file=sys.stderr)
        return 2

    pool = {building_id: [] for building_id in buildings}
    unmatched_cursor = 0
    for building_id in buildings:
        pool[building_id] = [
            entry
            for entry in assignments
            if entry["kind"] == "building" and entry["building"] == building_id
        ]
        take = unmatched_shares[building_id]
        pool[building_id].extend(
            unmatched_entries[unmatched_cursor : unmatched_cursor + take]
        )
        unmatched_cursor += take

    final_counts = {sector["id"]: 0 for sector in sectors}
    plan_item_sector = {}
    for building_id in buildings:
        entries = sorted(pool[building_id], key=lambda e: (e["row"], e["id"]))
        expected = sum(free_counts[building_id].values())
        if len(entries) != expected:
            print(
                f"ERROR: pool de {building_id} ({len(entries)}) != cupos libres ({expected}).",
                file=sys.stderr,
            )
            return 2
        cursor = 0
        for sector_id in sorted(building_info[building_id]["sectors"]):
            take = free_counts[building_id][sector_id]
            for entry in entries[cursor : cursor + take]:
                plan_item_sector[entry["id"]] = sector_id
            cursor += take
            final_counts[sector_id] = pinned_sector_counts[sector_id] + take

    for entry in assignments:
        if entry["kind"] == "sector":
            plan_item_sector[entry["id"]] = entry["sector"]

    violations = [
        sector_id
        for sector_id, count in final_counts.items()
        if count < 1
    ]
    if violations:
        print(f"ERROR: sectores sin equipo: {violations}", file=sys.stderr)
        return 2

    report = {
        "generatedAtUtc": now_iso,
        "dbPath": str(db_path),
        "apply": bool(args.apply),
        "totals": {
            "target": total,
            "matchedSector": stats["sector"],
            "matchedBuilding": stats["building"],
            "unmatched0Pct": stats["unmatched"],
            "reclassifiedOtherToPc": reclassify_count,
            "keptOtherNoRetirado": keep_other,
        },
        "buildings": [],
        "sectors": [],
        "unmatched0PctItems": stats["unmatched"],
        "notes": (
            "Los equipos 0% se distribuyen proporcionalmente al area del "
            "edificio y luego al area de cada sector."
        ),
    }
    for building_id in buildings:
        report["buildings"].append(
            {
                "id": building_id,
                "areaM2": round(building_info[building_id]["area"], 1),
                "geometrySource": building_info[building_id]["source"],
                "quota": quotas[building_id],
                "matchedSectorPinned": sum(
                    pinned_sector_counts[sid]
                    for sid in building_info[building_id]["sectors"]
                ),
                "matchedBuildingPinned": building_pinned_counts[building_id],
            }
        )
    for sector in sectors:
        report["sectors"].append(
            {
                "id": sector["id"],
                "building": sector["building"],
                "floor": sector["floor"],
                "areaM2": round(sector["area"], 1),
                "finalCount": final_counts[sector["id"]],
                "pinned": pinned_sector_counts[sector["id"]],
            }
        )
    report["matches"] = match_details

    if args.apply:
        notes_by_item = {}
        for entry in assignments:
            sector_id = plan_item_sector[entry["id"]]
            sector = sector_by_id[sector_id]
            if entry["kind"] == "sector":
                note = f"coincidencia por sector: {entry['label']} | {entry['detail']}"
            elif entry["kind"] == "building":
                note = f"coincidencia por edificio: {entry['label']} | {entry['detail']}"
            else:
                note = "0%: asignacion proporcional por tamano de edificio y sector"
            notes_by_item[entry["id"]] = note[:MAX_NOTES_LEN]
            conn.execute(
                """
                UPDATE ImportedInventoryItems
                SET AssignedRoomExternalId = ?, AssignedBuildingExternalId = ?,
                    AssignedFloor = ?, AssignmentNotes = ?, AssignmentUpdatedAtUtc = ?
                WHERE Id = ?
                """,
                (
                    sector_id,
                    sector["building"],
                    sector["floor"],
                    notes_by_item[entry["id"]],
                    now_iso,
                    entry["id"],
                ),
            )

        conn.commit()

        problems = []
        assigned_rows = conn.execute(
            """
            SELECT COUNT(*) FROM ImportedInventoryItems
            WHERE DeletedAtUtc IS NULL AND AssignedRoomExternalId <> ''
            """
        ).fetchone()[0]
        target_after = conn.execute(
            """
            SELECT COUNT(*) FROM ImportedInventoryItems
            WHERE DeletedAtUtc IS NULL
              AND (InferredCategory IN ('pc', 'printer')
                   OR (InferredCategory = 'other' AND lower(trim(SerialNumber)) <> ?))
            """,
            (NO_RETIRADO,),
        ).fetchone()[0]
        if assigned_rows != target_after:
            problems.append(
                f"asignados={assigned_rows} != objetivo={target_after}"
            )

        mismatch_rows = conn.execute(
            """
            SELECT COUNT(*) FROM ImportedInventoryItems i
            JOIN ManualRooms r ON r.ExternalId = i.AssignedRoomExternalId
            WHERE r.DeletedAtUtc IS NULL
              AND (i.AssignedBuildingExternalId <> r.BuildingExternalId
                   OR COALESCE(i.AssignedFloor, -1) <> COALESCE(r.Floor, -1))
            """
        ).fetchone()[0]
        if mismatch_rows:
            problems.append(f"{mismatch_rows} asignaciones con edificio/piso inconsistente")

        for sector in sectors:
            count = conn.execute(
                """
                SELECT COUNT(*) FROM ImportedInventoryItems
                WHERE AssignedRoomExternalId = ? AND DeletedAtUtc IS NULL
                """,
                (sector["id"],),
            ).fetchone()[0]
            if count < 1:
                problems.append(f"sector vacio: {sector['id']}")

        leftover_other = conn.execute(
            """
            SELECT COUNT(*) FROM ImportedInventoryItems
            WHERE InferredCategory = 'other' AND lower(trim(SerialNumber)) <> ?
            """,
            (NO_RETIRADO,),
        ).fetchone()[0]
        if leftover_other:
            problems.append(f"quedan {leftover_other} 'other' sin reclasificar")

        no_retirado_assigned = conn.execute(
            """
            SELECT COUNT(*) FROM ImportedInventoryItems
            WHERE lower(trim(SerialNumber)) = ? AND AssignedRoomExternalId <> ''
            """,
            (NO_RETIRADO,),
        ).fetchone()[0]
        if no_retirado_assigned:
            problems.append(
                f"{no_retirado_assigned} 'No Retirado' quedaron asignados"
            )

        report["verification"] = {
            "assigned": assigned_rows,
            "targetAfter": target_after,
            "problems": problems,
            "ok": not problems,
        }

        if problems:
            print("VERIFICACION FALLIDA:", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            conn.rollback()
            print("Cambios revertidos.", file=sys.stderr)
            return 1
    else:
        conn.rollback()

    conn.close()

    if args.report:
        Path(args.report).write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
