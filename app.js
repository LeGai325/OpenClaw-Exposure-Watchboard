const PAGE_SIZE = 100;
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

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

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
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== '')) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0];
  return rows.slice(1).map((values) => {
    const item = {};
    header.forEach((key, index) => {
      item[key] = values[index] ?? '-';
    });
    return item;
  });
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
  pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页（总计 ${data.length} 条）`;
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
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`加载数据失败: ${response.status}`);
    }
    const csvText = await response.text();
    data = parseCSV(csvText);
    renderRows();
  } catch (error) {
    pageInfo.textContent = `数据加载失败：${error.message}`;
  }
}

init();
