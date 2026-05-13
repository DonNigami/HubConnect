// =============================================================
//  CONFIG — อ่านค่าจาก Script Properties (Project Settings → Script Properties)
//  ไม่มีค่าจริงใน code — ตั้งค่าใน Apps Script editor แทน
// =============================================================
var _props = PropertiesService.getScriptProperties();
var CONFIG = {
  SHEET_ID:           _props.getProperty('SHEET_ID')           || '',
  ROOT_FOLDER_ID:     _props.getProperty('ROOT_FOLDER_ID')     || '',
  LINE_CHANNEL_TOKEN: _props.getProperty('LINE_CHANNEL_TOKEN') || '',
  LIFF_ID:            _props.getProperty('LIFF_ID')            || '',
};

var HUB_SHEET_ID  = _props.getProperty('HUB_SHEET_ID') || '';
var LINE_API_BASE = 'https://api.line.me/v2/bot/message';

// =============================================================
//  doGet — route by ?page= / ?action= parameter
// =============================================================
function doGet(e) {
  var p = e.parameter || {};

  // ── REST API (สำหรับ Vercel host หรือ fetch จากภายนอก) ──
  if (p.action) {
    var result;
    try {
      if (p.action === 'branches') {
        result = { ok: true, data: adminGetBranches() };
      } else if (p.action === 'search') {
        result = { ok: true, data: adminSearch({
          wave:     p.wave     || '',
          branch:   p.branch   || '',
          dateFrom: p.dateFrom || '',
          dateTo:   p.dateTo   || '',
          type:     p.type     || 'all'
        })};
      } else {
        result = { ok: false, error: 'unknown action' };
      }
    } catch(err) {
      result = { ok: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── HTML pages ──
  if (p.page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('AdminPage')
      .setTitle('HubConnect — Admin');
  }

  var template = HtmlService.createTemplateFromFile('LiffApp');
  template.liffId = CONFIG.LIFF_ID;
  return template.evaluate()
    .setTitle('บันทึกรูปสินค้า')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =============================================================
//  Admin — search uploads from Upload_Log + Drive
// =============================================================

/**
 * ค้นหา session จาก Upload_Log sheet แล้วดึงไฟล์จาก Drive
 * @param {Object} params - { wave, branch, dateFrom, dateTo, type }
 * @returns {Array} sessions
 */
function adminSearch(params) {
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('Upload_Log');
  if (!sheet) throw new Error('ไม่พบ Sheet Upload_Log');

  var data    = sheet.getDataRange().getValues();
  var results = [];

  for (var i = data.length - 1; i >= 1; i--) {  // newest first
    var row        = data[i];
    var timestamp  = row[0];
    var wave       = String(row[1] || '');
    var branch     = String(row[2] || '');
    var date       = String(row[3] || '');
    var type       = String(row[4] || '');
    var folderUrl  = String(row[8] || '');

    // กรอง
    if (params.wave   && wave.toLowerCase().indexOf(params.wave.toLowerCase())     === -1) continue;
    if (params.branch && branch.toLowerCase().indexOf(params.branch.toLowerCase()) === -1) continue;
    if (params.type   && params.type !== 'all' && type !== params.type) continue;
    if (params.dateFrom && date < params.dateFrom) continue;
    if (params.dateTo   && date > params.dateTo)   continue;

    // ดึง folder ID จาก URL
    var match = folderUrl.match(/[-\w]{25,}/);
    if (!match) continue;

    var files = [];
    try {
      var folder = DriveApp.getFolderById(match[0]);
      var it     = folder.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        files.push({
          id:   f.getId(),
          name: f.getName()
        });
      }
    } catch(e) {
      files = [];  // folder ถูกลบหรือไม่มีสิทธิ์
    }

    // แปลง date YYYY-MM-DD → DD/MM/YYYY
    var dp = date.split('-');
    var displayDate = dp.length === 3 ? dp[2]+'/'+dp[1]+'/'+dp[0] : date;

    var ts = '';
    try {
      ts = Utilities.formatDate(new Date(timestamp), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
    } catch(e) { ts = String(timestamp); }

    results.push({
      wave:        wave,
      branch:      branch,
      date:        date,
      displayDate: displayDate,
      type:        type,
      folderUrl:   folderUrl,
      uploadedAt:  ts,
      photoCount:  files.length,
      files:       files
    });

    if (results.length >= 100) break;  // จำกัด 100 sessions
  }

  return results;
}

/**
 * คืนรายชื่อสาขาที่เคย upload (จาก Upload_Log) สำหรับ dropdown ค้นหา
 */
function adminGetBranches() {
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('Upload_Log');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var set  = {};
  for (var i = 1; i < data.length; i++) {
    var b = String(data[i][2] || '').trim();
    if (b) set[b] = true;
  }
  return Object.keys(set).sort();
}

// =============================================================
//  doPost — LINE Webhook receiver
// =============================================================
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var events = body.events || [];
    events.forEach(function(event) {
      if (event.type === 'message' || event.type === 'follow') {
        replyWithLiff(event.replyToken, 'https://liff.line.me/' + CONFIG.LIFF_ID);
      }
    });
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }
  return ContentService.createTextOutput('OK');
}

// =============================================================
//  Public functions — called from LIFF via google.script.run
// =============================================================

/**
 * คืน waves และ branches จาก HUB sheet
 * @returns {{ waves: string[], branches: string[] }}
 */
function getHubData() {
  var ss    = SpreadsheetApp.openById(HUB_SHEET_ID);
  var sheet = ss.getSheetByName('HUB');
  if (!sheet) throw new Error('ไม่พบ Sheet ชื่อ "HUB"');

  var data      = sheet.getDataRange().getValues();
  var waveSet   = {};
  var branchSet = {};

  for (var i = 1; i < data.length; i++) {
    var wave   = String(data[i][4] || '').trim();  // column E
    var branch = String(data[i][6] || '').trim();  // column G
    if (wave)   waveSet[wave]     = true;
    if (branch) branchSet[branch] = true;
  }

  return {
    waves:    Object.keys(waveSet).sort(),
    branches: Object.keys(branchSet).sort()
  };
}

/**
 * สร้าง Drive folder path: Root / branch / date / wave
 * @param {Object} metadata - { wave, branch, date, type, userId, displayName, photoCount }
 * @returns {{ folderId: string, folderUrl: string }}
 */
function createUploadSession(metadata) {
  var root        = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  var branchFold  = _getOrCreateFolder(root,       metadata.branch);
  var dateFold    = _getOrCreateFolder(branchFold, metadata.date);
  var waveFold    = _getOrCreateFolder(dateFold,   metadata.wave);

  return {
    folderId:  waveFold.getId(),
    folderUrl: waveFold.getUrl()
  };
}

/**
 * อัปโหลดรูปทีละใบเข้า Drive folder
 * @param {Object} params - { folderId, filename, base64, mimeType, index }
 */
function uploadPhoto(params) {
  var folder  = DriveApp.getFolderById(params.folderId);
  var decoded = Utilities.base64Decode(params.base64);
  var blob    = Utilities.newBlob(decoded, params.mimeType || 'image/jpeg', params.filename);
  var file    = folder.createFile(blob);

  return { fileId: file.getId(), fileUrl: file.getUrl(), index: params.index };
}

/**
 * บันทึก log ใน Sheets + ส่ง LINE push notification
 * @param {Object} result - { wave, branch, date, type, userId, displayName, photoCount, folderUrl }
 */
function finalizeUpload(result) {
  // บันทึก Upload_Log
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('Upload_Log');
  if (!sheet) throw new Error('ไม่พบ Sheet ชื่อ "Upload_Log"');

  sheet.appendRow([
    new Date(),
    result.wave        || '',
    result.branch      || '',
    result.date        || '',
    result.type        || '',
    result.userId      || '',
    result.displayName || '',
    result.photoCount  || 0,
    result.folderUrl   || '',
    'success'
  ]);

  // LINE push notification (ข้ามถ้าเป็น dev user)
  if (result.userId && result.userId.indexOf('dev_') !== 0) {
    var lines = [
      '✅ อัปโหลดรูปสินค้าเรียบร้อยแล้ว! ' + result.photoCount + ' รูป',
      '📌 Wave: '  + result.wave,
      '🏬 สาขา: ' + result.branch,
      '📅 วันที่: ' + result.date,
      '📂 ดูรูป: ' + result.folderUrl
    ];
    _linePost(LINE_API_BASE + '/push', {
      to:       result.userId,
      messages: [{ type: 'text', text: lines.join('\n') }]
    });
  }

  return { success: true };
}

// =============================================================
//  LINE helpers — reply + Flex Message
// =============================================================

function replyWithLiff(replyToken, liffUrl) {
  _linePost(LINE_API_BASE + '/reply', {
    replyToken: replyToken,
    messages:   [_buildFlexMessage(liffUrl)]
  });
}

function _buildFlexMessage(liffUrl) {
  return {
    type:     'flex',
    altText:  'บันทึกรูปขึ้น/ลงสินค้า',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type:            'box',
        layout:          'vertical',
        backgroundColor: '#06C755',
        paddingAll:      '20px',
        contents: [{
          type:   'text',
          text:   '🚚 บันทึกรูปสินค้า',
          color:  '#FFFFFF',
          size:   'xl',
          weight: 'bold'
        }]
      },
      body: {
        type:    'box',
        layout:  'vertical',
        spacing: 'md',
        contents: [{
          type:  'text',
          text:  'ถ่ายรูปตอนขึ้นหรือลงสินค้า พร้อมระบุเลข Wave, สาขา และวันที่',
          wrap:  true,
          color: '#555555',
          size:  'sm'
        }]
      },
      footer: {
        type:   'box',
        layout: 'vertical',
        contents: [{
          type:   'button',
          style:  'primary',
          color:  '#06C755',
          action: {
            type:  'uri',
            label: '📷 เปิดฟอร์มอัปโหลด',
            uri:   liffUrl
          }
        }]
      }
    }
  };
}

function _linePost(url, payload) {
  var resp = UrlFetchApp.fetch(url, {
    method:          'post',
    contentType:     'application/json',
    headers:         { 'Authorization': 'Bearer ' + CONFIG.LINE_CHANNEL_TOKEN },
    payload:         JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    Logger.log('LINE API error: ' + resp.getContentText());
  }
}

// =============================================================
//  Drive helper
// =============================================================

function _getOrCreateFolder(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  return it.hasNext() ? it.next() : parentFolder.createFolder(name);
}
