const PAGE_SIZE = 100;
const MAX_ROWS_TO_LOAD = 5000;
const DATA_PATH = 'data/exposure_watchboard_data.csv';

const columns = [
  'endpoint',
  'endpoint_url',
  'Assistant Name',
  'Country',
  'auth_required',
  'is_active',
  'has_leaked_creds',
  'asn',
  'asn_name',
  'org',
  'first_seen',
  'last_seen',
  'asi_has_breach',
  'asi_has_threat_actor',
  'asi_threat_actors',
  'asi_cves',
  'asi_enriched_at',
  'asi_domains',
  'page',
  'row_index'
];

const tableHead = document.querySelector('#watchboardTable thead');
const tableBody = document.querySelector('#watchboardTable tbody');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let data = [];
let currentPage = 1;
let isTruncated = false;
let totalRowsParsed = 0;

function pushRow(rowValues, header, rows, limit) {
  if (!rowValues.some((value) => value !== '')) {
    return;
  }

  if (!header.length) {
    header.push(...rowValues);
    return;
  }

  totalRowsParsed += 1;
  if (rows.length >= limit) {
    isTruncated = true;
    return;
  }

  const item = {};
  header.forEach((key, index) => {
    item[key] = rowValues[index] ?? '-';
  });
  rows.push(item);
}

async function parseCSVStream(response, limit) {
  if (!response.body) {
    throw new Error('浏览器不支持流式读取');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const rows = [];
  const header = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  while (true) {
    const { value, done } = await reader.read();
    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });

    for (let i = 0; i < chunk.length; i += 1) {
      const char = chunk[i];
      const next = chunk[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i += 1;
        }

        row.push(cell.trim());
        cell = '';
        pushRow(row, header, rows, limit);
        row = [];
      } else {
        cell += char;
      }
    }

    if (done) {
      break;
    }

    if (rows.length >= limit) {
      isTruncated = true;
      await reader.cancel();
      break;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    pushRow(row, header, rows, limit);
  }

  return rows;
}

function renderHeader() {
  const tr = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column;
    tr.appendChild(th);
  });
  tableHead.innerHTML = '';
  tableHead.appendChild(tr);
}

function renderRows() {
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = data.slice(startIndex, startIndex + PAGE_SIZE);

  tableBody.innerHTML = '';
  pageRows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      td.textContent = row[column] ?? '-';
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const suffix = isTruncated
    ? `（数据过大，仅展示前 ${data.length} 条；已解析 ${totalRowsParsed} 条）`
    : `（总计 ${data.length} 条）`;
  pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页${suffix}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
}

function wirePagination() {
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderRows();
    }
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderRows();
    }
  });
}

async function init() {
  renderHeader();
  wirePagination();

  try {
    pageInfo.textContent = '正在加载数据...';
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`加载数据失败: ${response.status}`);
    }

    totalRowsParsed = 0;
    isTruncated = false;
    data = await parseCSVStream(response, MAX_ROWS_TO_LOAD);
    renderRows();
  } catch (error) {
    pageInfo.textContent = `数据加载失败：${error.message}`;
  }
}

init();
