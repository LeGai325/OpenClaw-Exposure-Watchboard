const PAGE_SIZE = 100;
const MAX_ROWS_TO_LOAD = 5000;
const DATA_PATH = 'data/exposure_watchboard_data.csv';
const LFS_POINTER_SIGNATURE = 'version https://git-lfs.github.com/spec/v1';

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

function parseRepoFromGitHubPagesLocation() {
  const host = window.location.hostname;
  if (!host.endsWith('.github.io')) {
    return null;
  }

  const owner = host.replace('.github.io', '');
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const repo = pathParts[0];

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

async function isGitLFSPointer(response) {
  // 放弃严格的 content-length 检查，改用更稳健的 includes 判断
  const text = await response.text();
  return text.includes('git-lfs.github.com/spec/v1');
}

async function fetchCSVResponse() {
  const primary = await fetch(DATA_PATH);
  if (!primary.ok) {
    throw new Error(`加载数据失败: ${primary.status}`);
  }

  // 使用 clone() 避免消耗掉原始流
  if (!(await isGitLFSPointer(primary.clone()))) {
    return primary;
  }

  // --- 确认为 LFS 指针文件后的回退逻辑 ---
  const repoInfo = parseRepoFromGitHubPagesLocation();
  if (!repoInfo) {
    throw new Error('检测到 Git LFS 指针文件，但当前不在 GitHub Pages 环境。如果您在本地测试，请先运行 git lfs pull');
  }

  const fallbackUrl = `https://media.githubusercontent.com/media/${repoInfo.owner}/${repoInfo.repo}/main/${DATA_PATH}`;
  const fallback = await fetch(fallbackUrl);

  if (!fallback.ok) {
    throw new Error(`GitHub Pages 检测到 LFS 指针，回退源加载失败: ${fallback.status}`);
  }

  return fallback;
}

function pushRow(rowValues, header, rows, limit) {
  if (!rowValues.some((value) => value !== '')) {
    return;
  }

  if (!header.length) {
    rowValues.forEach((value, index) => {
      header.push(index === 0 ? value.replace(/^\uFEFF/, '') : value);
    });
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
  } // 修复：这里之前缺失了一个右大括号

  if (cell || row.length) {
    row.push(cell.trim());
    pushRow(row, header, rows, limit);
  }

  const hasKnownColumn = header.some((column) => columns.includes(column));
  if (!hasKnownColumn) {
    throw new Error('数据表头不匹配，无法渲染表格');
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
  // 移除了 isTruncated 的复杂判断，直接显示总条数
  const suffix = `（总计 ${data.length} 条）`;
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
    // 提示语稍微改一下，因为加载 130MB 数据会比较耗时
    pageInfo.textContent = '正在加载并解析全部数据，这可能需要几十秒的时间，请耐心等待...';

    totalRowsParsed = 0;
    isTruncated = false;

    const response = await fetchCSVResponse();
    // 将原本的 MAX_ROWS_TO_LOAD 替换为 Infinity（无穷大），解除限制
    data = await parseCSVStream(response, Infinity);
    renderRows();
  } catch (error) {
    pageInfo.textContent = `数据加载失败：${error.message}`;
  }
}

init();
