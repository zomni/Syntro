#!/usr/bin/env python3
"""
Export training data for ML models from Syntro's SQLite database.

Generates two CSV files:
  - item-classification-training.csv  (for inventory item category classification)
  - risk-prediction-training.csv      (for network device risk prediction)

Usage:
  python export-ml-training-data.py [--db PATH] [--output DIR]
"""

import argparse
import csv
import os
import sqlite3
import sys


def export_item_classification(db_path: str, output_dir: str) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT Description, Observation, Lot, InferredCategory
        FROM ImportedInventoryItems
        WHERE Description IS NOT NULL
          AND Description != ''
          AND InferredCategory IS NOT NULL
          AND InferredCategory != ''
    """)

    output_path = os.path.join(output_dir, "item-classification-training.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Description", "Observation", "Lot", "Label"])
        for row in cursor:
            writer.writerow([
                row["Description"] or "",
                row["Observation"] or "",
                row["Lot"] or "",
                row["InferredCategory"],
            ])

    conn.close()
    return output_path


def export_risk_prediction(db_path: str, output_dir: str) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            o.IsOnline,
            o.MatchKey,
            o.BuildingExternalId,
            o.AuthUserId,
            o.AntivirusStatus,
            o.PatchStatus,
            o.DomainJoined,
            o.DiskTotalGb,
            o.DiskFreeGb,
            o.LastBootAtUtc,
            o.PingMs,
            o.OpenPorts,
            o.RiskLevel
        FROM NetworkTelemetryObservations o
        WHERE o.ObservationType = 'device'
          AND o.RiskLevel IS NOT NULL
          AND o.RiskLevel != ''
    """)

    output_path = os.path.join(output_dir, "risk-prediction-training.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "IsOnline", "MatchScore", "HasAssignedBuilding",
            "DuplicateIpCount", "DuplicateMacCount", "IsKnownUser",
            "DeviceCount", "AntivirusEnabled", "PendingPatches",
            "DomainJoined", "DiskFreePercent", "UptimeDays",
            "PingMs", "RdpExposed", "SmbExposed", "SshExposed",
            "OpenPortCount", "Label"
        ])
        for row in cursor:
            is_online = 1.0 if row["IsOnline"] == 1 else 0.0
            match_score = 1.0 if row["MatchKey"] else 0.0
            has_building = 1.0 if row["BuildingExternalId"] else 0.0
            is_known = 1.0 if row["AuthUserId"] else 0.0

            antivirus = (row["AntivirusStatus"] or "").upper()
            antivirus_ok = 1.0 if antivirus and "DISABLED" not in antivirus and "INACTIVE" not in antivirus else 0.0

            patches = (row["PatchStatus"] or "").upper()
            pending = 1.0 if "OUTDATED" in patches or "PENDING" in patches or "FAILED" in patches else 0.0

            domain = 1.0 if row["DomainJoined"] == 1 else 0.0

            disk_total = row["DiskTotalGb"] or 0
            disk_free = row["DiskFreeGb"] or 0
            disk_pct = (disk_free / disk_total * 100) if disk_total > 0 else 100.0

            uptime = 0.0
            if row["LastBootAtUtc"]:
                from datetime import datetime
                try:
                    boot = datetime.fromisoformat(row["LastBootAtUtc"].replace("Z", "+00:00"))
                    uptime = (datetime.utcnow() - boot.replace(tzinfo=None)).total_seconds() / 86400
                except (ValueError, TypeError):
                    uptime = 0.0

            ping = row["PingMs"] or 0
            ports_str = row["OpenPorts"] or ""
            ports = set()
            if ports_str:
                for p in ports_str.split(","):
                    p = p.strip()
                    if p.isdigit():
                        ports.add(int(p))

            rdp = 1.0 if 3389 in ports else 0.0
            smb = 1.0 if ports & {445, 139, 135} else 0.0
            ssh = 1.0 if 22 in ports else 0.0
            port_count = float(len(ports))

            label = "high_risk" if row["RiskLevel"] in ("critical", "high") else "low_risk"

            writer.writerow([
                is_online, match_score, has_building,
                0.0, 0.0, is_known,
                0.0, antivirus_ok, pending,
                domain, round(disk_pct, 1), round(uptime, 1),
                ping, rdp, smb, ssh,
                port_count, label
            ])

    conn.close()
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Export ML training data from Syntro DB")
    parser.add_argument("--db", default="syntro.db", help="Path to SQLite database")
    parser.add_argument("--output", default=".", help="Output directory for CSV files")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Error: Database not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    item_path = export_item_classification(args.db, args.output)
    print(f"Item classification training data: {item_path}")

    risk_path = export_risk_prediction(args.db, args.output)
    print(f"Risk prediction training data: {risk_path}")


if __name__ == "__main__":
    main()
