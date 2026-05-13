# HubConnect — บันทึกรูปขึ้น/ลงสินค้า

LINE Bot + LIFF สำหรับถ่ายรูปและอัปโหลดเมื่อขึ้นหรือลงสินค้า  
อ้างอิง Wave / สาขา / วันที่ → บันทึกลง Google Drive แบ่งเป็น Branch › Date › Wave

---

## Stack

| ส่วน | เทคโนโลยี |
|------|-----------|
| LINE Bot | LINE Messaging API |
| LIFF | Apps Script HTML Service (`doGet`) |
| Backend | Google Apps Script Web App |
| Storage | Google Drive (DriveApp) |
| Database | Google Sheets (HUB + Upload_Log) |
| Admin UI | GitHub Pages (`/docs`) |
| Deploy | `clasp push` |

---

## โครงสร้างไฟล์

```
HubConnect/
├── appscript/
│   ├── appsscript.json   ← manifest + OAuth scopes
│   ├── Code.gs           ← doGet / doPost / CONFIG / functions ทั้งหมด
│   ├── LiffApp.html      ← LIFF form (served by Apps Script)
│   └── AdminPage.html    ← Admin page (served by Apps Script ?page=admin)
├── docs/
│   └── index.html        ← Admin page สำหรับ GitHub Pages
├── .clasp.json           ← clasp config
└── README.md
```

---

## วิธี Setup (ทำครั้งเดียว)

### 1. สร้าง Google Sheets

1. ไปที่ [sheets.google.com](https://sheets.google.com) → สร้าง Spreadsheet ใหม่ชื่อ **"HubConnect_Log"**
2. สร้าง sheet ชื่อ **`Upload_Log`** พร้อม header row:

```
timestamp | wave | branch_name | date | type | line_user_id | display_name | photo_count | drive_folder_url | status
```

3. จด **Spreadsheet ID** จาก URL:  
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

---

### 2. Google Drive Folder

ใช้ folder ที่มีอยู่แล้ว ID: `1Hj_1fxOxcMcdQKGRTktaKWSpPOofY-x4`  
(หรือสร้างใหม่แล้วอัปเดต `ROOT_FOLDER_ID` ใน `Code.gs`)

---

### 3. สร้าง Apps Script Project

#### Option A: ผ่าน clasp (แนะนำ)

```bash
# ติดตั้ง clasp
npm install -g @google/clasp

# Login
clasp login

# สร้าง project ใหม่
clasp create --title "HubConnect" --type webapp

# จะได้ scriptId ใหม่ → ใส่ใน .clasp.json
```

#### Option B: ผ่าน Browser

1. ไป [script.google.com](https://script.google.com) → New project
2. ตั้งชื่อ "HubConnect"
3. จด **Script ID** จาก Project Settings

---

### 4. ใส่ค่า Config ใน `Code.gs`

แก้ `CONFIG` object:

```javascript
var CONFIG = {
  SHEET_ID:           'YOUR_GOOGLE_SHEET_ID',           // จากขั้นตอน 1
  ROOT_FOLDER_ID:     '1Hj_1fxOxcMcdQKGRTktaKWSpPOofY-x4',
  LINE_CHANNEL_TOKEN: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN', // จากขั้นตอน 7
  LIFF_ID:            'YOUR_LIFF_ID',                   // จากขั้นตอน 8
};
```

---

### 5. Push code ไป Apps Script

```bash
clasp push
```

---

### 6. Deploy เป็น Web App

1. ไปที่ Apps Script editor → **Deploy → New Deployment**
2. ตั้งค่า:
   - **Type:** Web app
   - **Execute as:** Me (your Google account)
   - **Who has access:** Anyone
3. คลิก **Deploy** → จด **Deployment URL** และ **Deployment ID**  
   รูปแบบ URL: `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

---

### 7. แก้ไข `docs/index.html`

เปิด `docs/index.html` แล้วแก้บรรทัด:

```javascript
var GAS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

เปลี่ยน `YOUR_DEPLOYMENT_ID` เป็น Deployment ID จริงจากขั้นตอน 6

---

### 8. Deploy Admin UI ขึ้น GitHub Pages

1. Push ทั้ง repo ขึ้น GitHub:

```bash
git init
git add .
git commit -m "HubConnect - LINE Bot + LIFF + Admin"
git remote add origin https://github.com/YOUR_USERNAME/HubConnect.git
git push -u origin main
```

2. ไป GitHub repo → **Settings → Pages**
3. ตั้งค่า Source:
   - **Branch:** `main`
   - **Folder:** `/docs`
4. กด **Save**

ได้ URL: `https://YOUR_USERNAME.github.io/HubConnect/`

---

### 9. ตั้งค่า LINE Bot Channel

1. ไป [LINE Developers Console](https://developers.line.biz/console/)
2. สร้าง Provider → สร้าง **Messaging API channel** ใหม่
3. ตั้งค่า Webhook:
   - **Webhook URL:** Deployment URL จากขั้นตอน 6
   - เปิด **Use webhook**
   - ปิด **Auto-reply messages**
4. จด **Channel Access Token** (Long-lived) → ใส่ใน `CONFIG.LINE_CHANNEL_TOKEN`

---

### 10. สร้าง LIFF App

1. ใน LINE Developers Console → เลือก channel เดิม → แท็บ **LIFF**
2. **Add** → ตั้งค่า:
   - **Size:** Full
   - **Endpoint URL:** Deployment URL จากขั้นตอน 6
   - **Scopes:** `openid`, `profile`
3. จด **LIFF ID** (รูปแบบ `1234567890-xxxxxxxx`)
4. ใส่ใน `CONFIG.LIFF_ID` → `clasp push` → **Redeploy** (New Deployment)

> ⚠️ หลังแก้ CODE ต้อง Deploy ใหม่ทุกครั้ง (New Deployment) จึงจะมีผล

---

## Google Drive Structure

```
Root Folder/
├── สาขา A/
│   └── 2026-05-13/
│       └── W001/
│           ├── สาขาA_20260513_143022_ขึ้นสินค้า_1.jpg
│           └── สาขาA_20260513_143022_ขึ้นสินค้า_2.jpg
└── สาขา B/
    └── ...
```

---

## การ Verify ระบบ

1. ส่งข้อความใดก็ได้ใน LINE Bot → ได้รับ Flex Message พร้อมปุ่มเปิด LIFF
2. กดปุ่ม → ฟอร์มโหลด, Dropdown Wave/สาขาแสดงข้อมูลจาก HUB sheet
3. กรอกข้อมูล เลือกรูป → กด "บันทึกรูปสินค้า" → progress bar ทำงาน
4. ตรวจสอบใน Google Drive: มีไฟล์รูปพร้อม text stamp
5. ตรวจสอบ Google Sheets → Sheet `Upload_Log` มีแถวใหม่
6. รับ LINE push message ยืนยันการอัปโหลด
7. เปิด `https://YOUR_USERNAME.github.io/HubConnect/` → ค้นหารูปได้
