# Blackbox master-data import templates

Fill the CSV files you need without changing filenames or headers, then open Dashboard > Upload Old Data. Upload **one template file per import** (for example, only `01_units.csv`). Import related files in separate uploads after their dependencies exist in the cloud.

How to fill a file:
1. Open it in Excel, Google Sheets, or LibreOffice. The header row is already correct.
2. Add one row per record below the header.
3. Save it back as CSV UTF-8. In Excel use File > Save As > CSV UTF-8 (Comma delimited); the default XLSX format is rejected.

Rules:
- UTF-8 CSV with a header row.
- Each upload contains exactly one template CSV. Other master-data files are not changed.
- ZIP and multi-file uploads are not supported.
- status: active or inactive.
- unit type: count, weight, volume, length, or other.
- product_type: STOCK_ITEM, CONSUMABLE, or RESALABLE.
- payment_terms: CASH, 7_DAYS, 15_DAYS, 30_DAYS, 45_DAYS, BILL_TO_BILL, or CUSTOM.
- booleans: true or false (case insensitive, e.g. TRUE, FALSE).
- product import_key is a permanent unique identifier for that product; keep using the same value in future uploads and in 07_product_skus.csv.
- brand_name, category_name, group_name, unit abbreviations, vendor_code, and sku are references and must match exactly.
- Referenced records must already exist from a previous import (for example, upload units before product SKUs).
- primary and manager contact names and phones are required for every vendor.
- Empty optional values are allowed. Do not add extra files or folders to the upload.
- **Barcode qty per scan:** On `07_product_skus.csv`, optional `barcode_quantity_multiplier` (default 1) sets how many base units one scan adds when using the SKU’s `barcode`. Use `10_product_sku_barcodes.csv` for extra barcodes on the same SKU (upload **after** `07_product_skus.csv`). `quantity_multiplier` must be greater than zero (e.g. 6 = six pieces per scan).
- **GST on SKU:** Optional `gst_percent` on `07_product_skus.csv` (0–100). Used for GST on inclusive sale line totals; leave empty for 0.

Uploading the same rows again updates the existing records instead of creating duplicates. The upload is atomic: if any row is invalid, nothing from that file is imported.

## Example values

These are examples only; do not copy them unless they are real customer data.

```csv
# 01_units.csv
abbreviation,name,type,status
PCS,Pieces,count,active
BOX,Box,count,active

# 02_brands.csv
name,description,status
Acme,Acme products,active

# 03_categories.csv
name,description,status
Shirts,Ready-made shirts,active

# 04_warehouses.csv
code,name,location,status
MAIN,Main Warehouse,Head office,active

# 05_vendor_groups.csv
name,description,status
Wholesale,Wholesale suppliers,active

# 06_products.csv
import_key,name,brand_name,category_name,product_type,description,status
shirt-001,Classic Shirt,Acme,Shirts,STOCK_ITEM,Cotton shirt,active

# 07_product_skus.csv
# Header must match exactly. Legacy 17-column files (without barcode_quantity_multiplier and gst_percent) are still accepted; missing values default to multiplier 1 and GST empty/0.
product_import_key,sku,barcode,barcode_quantity_multiplier,variant_name,size_value,size_unit,base_unit_abbreviation,purchase_unit_abbreviation,units_per_purchase_unit,cost_price,selling_price,selling_price_per_purchase_unit,gst_percent,reorder_level,minimum_stock_level,maximum_stock_level,track_inventory,status
shirt-001,SHIRT-BLK-M,1234567890123,1,Black / Medium,M,,PCS,BOX,12,100,150,,17,5,5,100,true,active
coke-330,COKE-330ML,8901030861234,6,Coke 330ml,,,PCS,PCS,1,50,80,,0,10,10,200,true,active

# 10_product_sku_barcodes.csv (extra barcodes; same SKU can have several)
sku,barcode,quantity_multiplier,status
COKE-330ML,8901030861234-BOX,6,active

# 08_vendors.csv
vendor_code,name,group_name,address,city,state,country,postal_code,sales_target,credit_limit,payment_terms,tax_number,notes,status,primary_name,primary_phone,primary_email,manager_name,manager_phone,manager_email,other_name,other_phone,other_email,salesperson_name,salesperson_phone,salesperson_email
V-001,Example Supplier,Wholesale,1 Market Road,Lahore,Punjab,Pakistan,54000,100000,50000,30_DAYS,NTN-001,,active,Ali,03000000000,ali@example.com,Sara,03000000001,sara@example.com,,,,,,

# 09_vendor_skus.csv
vendor_code,sku,vendor_sku_code,purchase_unit_abbreviation,units_per_purchase_unit,purchase_price,minimum_order_quantity,lead_time_days,is_preferred,notes,status
V-001,SHIRT-BLK-M,SUP-SHIRT-M,BOX,12,100,1,7,true,,active
```

Text containing commas, quotes, or line breaks must use normal CSV quoting. For
example: `"Warehouse 1, Industrial Area"`. Represent a quote inside a quoted
value by doubling it: `"The ""Main"" Warehouse"`.
