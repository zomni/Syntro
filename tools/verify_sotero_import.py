"""Verificación post-ETL del campus Sotero en Syntro (vía API) y siembra del
horario de planificación Lun-Jue si no existe.

Uso: python tools/verify_sotero_import.py
"""

import re
import sys
import requests

BASE = "http://localhost:5001"
USER = "admin@example.com"
PASS = "ChangeMe!123"

s = requests.Session()

r = s.get(f"{BASE}/Auth/Login", allow_redirects=True)
assert r.status_code == 200, "login page failed"
m = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', r.text)
assert m, "antiforgery token not found"

r = s.post(
    f"{BASE}/Auth/Login",
    data={"__RequestVerificationToken": m.group(1), "Username": USER, "Password": PASS},
    allow_redirects=False,
)
assert r.status_code == 302, f"login failed: {r.status_code}"
print("login -> 302 /dashboard")


def get(path):
    r = s.get(f"{BASE}{path}")
    assert r.status_code == 200, f"GET {path} -> {r.status_code} {r.text[:200]}"
    return r.json()


print("\n== Siembra de horarios (solo si faltan) ==")
existing = get("/api/network-telemetry/schedule")
active_labels = [(i.get("label"), i.get("cron"), i.get("isEnabled")) for i in existing]
print("  schedule rows actuales:", active_labels)

seed_plans = [
    ("Sotero Lun-Jue (3 turnos)", "0 30 8,13,17 * * 1-4", 1),
    ("Sotero Viernes (3 turnos)", "0 30 8,13,16 * * 5", 2),
]
for label, cron, sort_order in seed_plans:
    if not any(i.get("label") == label and i.get("cron") == cron and i.get("isEnabled") for i in existing):
        r = s.post(f"{BASE}/api/network-telemetry/schedule", json={
            "label": label,
            "cron": cron,
            "timeZone": "America/Santiago",
            "campusKey": "sotero",
            "isEnabled": True,
            "sortOrder": sort_order,
        })
        print(f"  create {label} -> {r.status_code} {r.text[:150]}")
        existing = get("/api/network-telemetry/schedule")
print("  schedule rows finales:", [(i.get("label"), i.get("cron"), i.get("isEnabled")) for i in existing])

print("\n== Telemetría ==")
status = get("/api/network-telemetry/status")
print(f"  HasData={status.get('hasData')} | Source={status.get('latestSourceName')} | "
      f"Health={status.get('healthLabel')} | DeviceCount={status.get('latestDeviceCount')}")
print(f"  Riesgo={status.get('latestRiskLevel')} ({status.get('latestRiskScore')}) | "
      f"Alto={status.get('latestHighRiskDeviceCount')} Med={status.get('latestMediumRiskDeviceCount')} Bajo={status.get('latestLowRiskDeviceCount')}")
print(f"  ObservedAtUtc={status.get('latestObservedAtUtc')}")
print(f"  TotalSnapshots(recents)={status.get('totalSnapshots')} | TopRisk={len(status.get('topRiskObservations', []))} | "
      f"BuildingSummaries={len(status.get('buildingRiskSummaries', []))} | Subnets={len(status.get('subnetRiskSummaries', []))}")

latest_id = status.get("latestSnapshotId")
print(f"  latestSnapshotId={latest_id}")

snap_page = get("/api/network-telemetry/snapshots?page=1&pageSize=10&sortBy=observedAt&sortDirection=desc")
print(f"  snapshots totalCount={snap_page.get('totalCount')} | items={len(snap_page.get('items', []))}")
first_snap = snap_page["items"][0]
print(f"  primer snapshot: {first_snap.get('sourceName')} @ {first_snap.get('observedAtUtc')} "
      f"devices={first_snap.get('deviceCount')} risk={first_snap.get('riskLevel')}")

obs = get(f"/api/network-telemetry/snapshots/{latest_id}/observations?take=5")
print(f"  observations(5): {[(o.get('observationType'), o.get('deviceName'), o.get('riskLevel'), o.get('riskScore')) for o in obs]}")

devices = get(f"/api/network-telemetry/snapshots/{latest_id}/devices?page=1&pageSize=5&sortBy=risk&sortDirection=desc")
print(f"  devices totalCount={devices.get('totalCount')} | buildingSummaries={len(devices.get('buildingRiskSummaries', []))}")
for d in devices.get("items", [])[:3]:
    print(f"    - {d.get('deviceName')} | {d.get('ipAddress')} | {d.get('riskLevel')} {d.get('riskScore')} | building={d.get('buildingExternalId')}")

runs = get("/api/network-telemetry/scheduled-scans?page=1&pageSize=5&sortBy=scheduledAtUtc&sortDirection=desc")
print(f"  scheduled-scans totalCount={runs.get('totalCount')}")
for run in runs.get("items", [])[:3]:
    print(f"    - {run.get('status')} @ {run.get('scheduledAtUtc')} devices={run.get('deviceCount')} cron={run.get('normalizedCron')}")

print("\n== Edificios e inventario ==")
synced = get("/api/synced-buildings?campus=sotero")
print(f"  synced-buildings(campus=sotero)={len(synced)} | ejemplo: {[(b.get('externalId'), b.get('displayName')) for b in synced[:2]]}")
manual = get("/api/manual-buildings?campus=sotero")
print(f"  manual-buildings(campus=sotero)={len(manual)}")
print("  (esperado: 6 activas; las otras 6 tienen SyncedBuilding IsActive=0 en Sotero y se ocultan)")
geo = get("/api/building-geometry-overrides")
print(f"  building-geometry-overrides={len(geo)}")
items = get("/api/inventory-import/items?pageSize=10&page=1")
print(f"  inventory-import/items len={len(items)}")
for item in items[:3]:
    print(f"    - {item.get('itemNumber')} | {item.get('description')} | building={item.get('assignedBuildingExternalId')}")

print("\nOK: verificación completa.")
