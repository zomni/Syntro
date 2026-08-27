"""
Migrate inventory data from sotero_map_api to Pireon.

Copies:
  - New ImportedInventoryItems (GLPI+TOSHIBA source) not yet in Pireon
  - DeliveryFormPdfFileName updates for existing items
  - All InventoryDocuments
  - PDF files from inventory-forms/ and inventory-documents/ directories
"""
import sqlite3
import uuid
import shutil
import os
from datetime import datetime

SOTERO_DB = r'C:\Users\paolo.vilches\Documents\repos\sotero_map_api\data\soteromap.db'
PIREON_DB = r'C:\Users\paolo.vilches\Documents\repos\Pireon\backend\data\pireon.db'
SOTERO_INVENTORY_FORMS = r'C:\Users\paolo.vilches\Documents\repos\sotero_map_api\data\inventory-forms'
SOTERO_INVENTORY_DOCS = r'C:\Users\paolo.vilches\Documents\repos\sotero_map_api\data\inventory-documents'
PIREON_INVENTORY_FORMS = r'C:\Users\paolo.vilches\Documents\repos\Pireon\backend\data\inventory-forms'
PIREON_INVENTORY_DOCS = r'C:\Users\paolo.vilches\Documents\repos\Pireon\backend\data\inventory-documents'

SOTERO_ORG_ID = 'A8AD3643-ACFB-473A-AB92-344F90CAC09E'


def new_guid():
    return str(uuid.uuid4()).upper()


def main():
    print('=== Sotero -> Pireon Inventory Migration ===')
    print()

    sotero = sqlite3.connect(SOTERO_DB)
    pireon = sqlite3.connect(PIREON_DB)
    sc = sotero.cursor()
    pc = pireon.cursor()

    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    # 1. Build mapping: (SourceFile, RowNumber) -> Pireon Guid Id
    pc.execute('SELECT Id, SourceFile, RowNumber, DeliveryFormPdfFileName FROM ImportedInventoryItems')
    pireon_item_map = {}
    pireon_items_by_key = {}
    for row in pc.fetchall():
        pireon_item_map[(row[1], row[2])] = row[0]
        pireon_items_by_key[(row[1], row[2])] = row
    print(f'Pireon existing items: {len(pireon_item_map)}')

    # 2. Find sotero items missing in Pireon
    sc.execute('SELECT * FROM ImportedInventoryItems')
    sotero_cols = [d[0] for d in sc.description]
    print(f'Sotero columns: {sotero_cols}')

    new_items = []
    pdf_updates = []
    all_sotero_items = {}

    for row in sc.fetchall():
        item = dict(zip(sotero_cols, row))
        key = (item['SourceFile'], item['RowNumber'])
        all_sotero_items[item['Id']] = (key, item)

        if key in pireon_item_map:
            # Update DeliveryFormPdfFileName if sotero has it and Pireon doesn't
            pireon_id = pireon_item_map[key]
            pireon_pdf = pireon_items_by_key[key][3]  # index 3 = DeliveryFormPdfFileName
            if item['DeliveryFormPdfFileName'] and item['DeliveryFormPdfFileName'] != pireon_pdf:
                pdf_updates.append((pireon_id, item['DeliveryFormPdfFileName']))
        else:
            new_items.append(item)

    print(f'New items to insert: {len(new_items)}')
    print(f'PDF filename updates: {len(pdf_updates)}')

    # 3. Insert new items
    if new_items:
        sotero_id_to_pireon_id = {}
        # Columns shared between sotero and Pireon (excluding sotero-only 'Id')
        shared_cols = [c for c in sotero_cols if c != 'Id']
        # Add OrgId and default values for Pireon-only columns
        insert_cols = shared_cols + ['OrgId', 'CategorySource', 'ClassificationConfidence', 'ClassificationDetail',
                                      'CreatedAtUtc', 'UpdatedAtUtc', 'DeletedAtUtc', 'CreatedBy', 'UpdatedBy',
                                      'DeletedBy', 'Version', 'IsActive']

        for item in new_items:
            pireon_id = new_guid()
            key = (item['SourceFile'], item['RowNumber'])
            pireon_item_map[key] = pireon_id
            sotero_id_to_pireon_id[item['Id']] = pireon_id

            values = []
            for col in shared_cols:
                values.append(item[col])
            # Pireon-only defaults
            values.extend([
                SOTERO_ORG_ID,  # OrgId
                'rule',         # CategorySource
                None,           # ClassificationConfidence
                '',             # ClassificationDetail
                now,            # CreatedAtUtc
                now,            # UpdatedAtUtc
                None,           # DeletedAtUtc
                '',             # CreatedBy
                '',             # UpdatedBy
                '',             # DeletedBy
                0,              # Version
                1,              # IsActive
            ])

            placeholders = ', '.join(['?' for _ in insert_cols])
            col_names = ', '.join(insert_cols)
            pc.execute(
                f'INSERT INTO ImportedInventoryItems (Id, {col_names}) VALUES (?, {placeholders})',
                [pireon_id] + values
            )
        print(f'Inserted {len(new_items)} new items')
    else:
        sotero_id_to_pireon_id = {}

    # Build full sotero_id -> pireon_id map (for existing + new)
    full_id_map = {}
    for key, pireon_id in pireon_item_map.items():
        # Find sotero Id for this key
        for sotero_id, (skey, _) in all_sotero_items.items():
            if skey == key:
                full_id_map[sotero_id] = pireon_id
                break

    # 4. Update DeliveryFormPdfFileName
    for pireon_id, pdf_name in pdf_updates:
        pc.execute(
            'UPDATE ImportedInventoryItems SET DeliveryFormPdfFileName = ? WHERE Id = ?',
            (pdf_name, pireon_id)
        )
    print(f'Updated {len(pdf_updates)} PDF filenames')

    # 5. Copy InventoryDocuments
    sc.execute('SELECT * FROM InventoryDocuments')
    doc_cols = [d[0] for d in sc.description]
    doc_count = 0
    skipped_docs = 0

    for row in sc.fetchall():
        doc = dict(zip(doc_cols, row))
        sotero_item_id = doc['ImportedInventoryItemId']
        pireon_item_id = full_id_map.get(sotero_item_id)
        if pireon_item_id is None:
            skipped_docs += 1
            continue

        pireon_doc_id = new_guid()
        pc.execute(
            '''INSERT INTO InventoryDocuments
               (Id, InventoryItemId, OriginalFileName, StoredFileName, ContentType, SizeBytes, Source, CreatedAtUtc, UpdatedAtUtc, DeletedAtUtc, CreatedBy, UpdatedBy, DeletedBy, Version, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', '', '', 0, 1)''',
            (pireon_doc_id, pireon_item_id, doc['OriginalFileName'], doc['StoredFileName'],
             doc['ContentType'], doc['SizeBytes'], doc['Source'], doc['CreatedAtUtc'], now)
        )
        doc_count += 1

    print(f'Inserted {doc_count} InventoryDocuments (skipped {skipped_docs})')

    # 6. Copy PDF files
    os.makedirs(PIREON_INVENTORY_DOCS, exist_ok=True)
    os.makedirs(PIREON_INVENTORY_FORMS, exist_ok=True)

    # Copy inventory-documents/
    files_copied_docs = 0
    if os.path.isdir(SOTERO_INVENTORY_DOCS):
        for fname in os.listdir(SOTERO_INVENTORY_DOCS):
            src = os.path.join(SOTERO_INVENTORY_DOCS, fname)
            dst = os.path.join(PIREON_INVENTORY_DOCS, fname)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
                files_copied_docs += 1
    print(f'Copied {files_copied_docs} files to inventory-documents/')

    # Copy inventory-forms/
    files_copied_forms = 0
    if os.path.isdir(SOTERO_INVENTORY_FORMS):
        for fname in os.listdir(SOTERO_INVENTORY_FORMS):
            src = os.path.join(SOTERO_INVENTORY_FORMS, fname)
            dst = os.path.join(PIREON_INVENTORY_FORMS, fname)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
                files_copied_forms += 1
    print(f'Copied {files_copied_forms} files to inventory-forms/')

    # 7. Commit
    pireon.commit()
    print()
    print('=== Migration complete ===')

    # Summary
    pc.execute('SELECT COUNT(*) FROM ImportedInventoryItems')
    print(f'Total items in Pireon: {pc.fetchone()[0]}')
    pc.execute('SELECT COUNT(*) FROM InventoryDocuments')
    print(f'Total documents in Pireon: {pc.fetchone()[0]}')
    pc.execute("SELECT COUNT(*) FROM ImportedInventoryItems WHERE DeliveryFormPdfFileName != ''")
    print(f'Items with PDF filename: {pc.fetchone()[0]}')

    sotero.close()
    pireon.close()


if __name__ == '__main__':
    main()
