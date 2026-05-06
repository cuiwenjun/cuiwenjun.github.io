let currentFile = null;
let currentZip = null;
let currentEntries = [];
let selectedEntry = null;
let manifestText = "";

const $ = (id) => document.getElementById(id);
const dropZone = $("dropZone");
const fileInput = $("fileInput");

if (dropZone && fileInput) {
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) await openJar(file);
  });
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await openJar(file);
  });

  $("searchInput").addEventListener("input", renderFileTree);
  $("viewManifestBtn").addEventListener("click", () => {
    const entry = currentEntries.find(e => e.path.toUpperCase() === "META-INF/MANIFEST.MF");
    if (entry) selectEntry(entry.path);
    else alert("MANIFEST.MF was not found in this JAR.");
  });
  $("downloadJarBtn").addEventListener("click", () => {
    if (!currentFile) return;
    downloadBlob(currentFile, currentFile.name);
  });
  $("extractAllBtn").addEventListener("click", async () => {
    if (!currentZip) return;
    const blob = await currentZip.generateAsync({ type: "blob" });
    downloadBlob(blob, currentFile.name.replace(/\.jar$/i, "") + "-extracted.zip");
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $("previewPane").classList.toggle("hidden", btn.dataset.tab !== "preview");
      $("hexPane").classList.toggle("hidden", btn.dataset.tab !== "hex");
    });
  });
}

async function openJar(file) {
  currentFile = file;
  try {
    currentZip = await JSZip.loadAsync(file);
  } catch (e) {
    alert("This file could not be opened as a JAR/ZIP archive.");
    return;
  }

  currentEntries = [];
  manifestText = "";
  selectedEntry = null;

  currentZip.forEach((path, zipEntry) => {
    currentEntries.push({
      path,
      name: path.split("/").filter(Boolean).pop() || path,
      dir: zipEntry.dir,
      size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
      zipEntry
    });
  });

  const manifest = currentZip.file(/META-INF\/MANIFEST\.MF$/i)[0];
  if (manifest) manifestText = await manifest.async("text");

  updateInfo();
  renderFileTree();
  $("workspace").classList.remove("hidden");
  $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateInfo() {
  $("infoName").textContent = currentFile.name;
  $("infoSize").textContent = formatBytes(currentFile.size);
  $("infoEntries").textContent = currentEntries.length.toLocaleString();
  $("infoManifest").textContent = manifestText ? "Yes" : "No";
  $("infoMainClass").textContent = readManifestValue("Main-Class") || "-";
  $("infoCreatedBy").textContent = readManifestValue("Created-By") || "-";
}

function readManifestValue(key) {
  if (!manifestText) return "";
  const lines = manifestText.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > -1 && line.slice(0, idx).trim().toLowerCase() === key.toLowerCase()) {
      return line.slice(idx + 1).trim();
    }
  }
  return "";
}

function renderFileTree() {
  const q = $("searchInput").value.trim().toLowerCase();
  const tree = $("fileTree");
  tree.innerHTML = "";

  const entries = currentEntries
    .filter(e => !q || e.path.toLowerCase().includes(q))
    .sort((a,b) => (b.dir - a.dir) || a.path.localeCompare(b.path))
    .slice(0, 1000);

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "file-row" + (selectedEntry && selectedEntry.path === entry.path ? " active" : "");
    row.onclick = () => !entry.dir && selectEntry(entry.path);

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = entry.dir ? "📁" : fileIcon(entry.path);

    const path = document.createElement("span");
    path.className = "file-path";
    path.textContent = entry.path;

    row.appendChild(icon);
    row.appendChild(path);
    tree.appendChild(row);
  }
}

async function selectEntry(path) {
  selectedEntry = currentEntries.find(e => e.path === path);
  renderFileTree();

  $("selectedStatus").textContent = `Selected: ${selectedEntry.path} (${formatBytes(selectedEntry.size)})`;

  const ext = getExt(path);
  const preview = $("previewPane");
  const hex = $("hexOutput");
  preview.innerHTML = "<p>Loading preview...</p>";
  hex.textContent = "";

  const blob = await selectedEntry.zipEntry.async("blob");
  const buffer = await blob.arrayBuffer();
  hex.textContent = toHex(buffer);

  if (isTextFile(ext, path)) {
    const text = await selectedEntry.zipEntry.async("text");
    preview.innerHTML = `
      <h2>${escapeHtml(selectedEntry.name)}</h2>
      <p><strong>Path:</strong> ${escapeHtml(selectedEntry.path)}</p>
      <p><strong>Size:</strong> ${formatBytes(selectedEntry.size)}</p>
      <div class="file-actions">
        <button class="outline-btn" onclick="downloadSelected()">Download File</button>
      </div>
      <pre>${escapeHtml(text.slice(0, 200000))}</pre>
    `;
  } else if (ext === "class") {
    preview.innerHTML = `
      <h2>CLASS file detected</h2>
      <p><strong>Path:</strong> ${escapeHtml(selectedEntry.path)}</p>
      <p><strong>Size:</strong> ${formatBytes(selectedEntry.size)}</p>
      <p>This web version supports Hex View for CLASS files.</p>
      <div class="file-actions">
        <button class="outline-btn" onclick="downloadSelected()">Download CLASS File</button>
        <a class="primary-btn" href="https://play.google.com/store/apps/details?id=com.coobbi.jarfileopener">Decompile on Android App</a>
      </div>
      <div class="warning-box">
        Online decompilation is not available in this version. The Android app supports CLASS decompilation to Java.
      </div>
    `;
  } else {
    preview.innerHTML = `
      <h2>${escapeHtml(selectedEntry.name)}</h2>
      <p><strong>Path:</strong> ${escapeHtml(selectedEntry.path)}</p>
      <p><strong>Size:</strong> ${formatBytes(selectedEntry.size)}</p>
      <p>Preview is not available for this binary file. Use Hex View or download the file.</p>
      <div class="file-actions">
        <button class="outline-btn" onclick="downloadSelected()">Download File</button>
      </div>
    `;
  }
}

async function downloadSelected() {
  if (!selectedEntry) return;
  const blob = await selectedEntry.zipEntry.async("blob");
  downloadBlob(blob, selectedEntry.name);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getExt(path) {
  const name = path.split("/").pop() || "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isTextFile(ext, path) {
  if (path.toUpperCase().endsWith("META-INF/MANIFEST.MF")) return true;
  return ["txt","xml","json","properties","mf","md","html","css","js","java","kt","gradle","yml","yaml","csv"].includes(ext);
}

function fileIcon(path) {
  const ext = getExt(path);
  if (ext === "class") return "☕";
  if (ext === "jar") return "📦";
  if (ext === "json") return "🧾";
  if (ext === "xml" || path.toUpperCase().endsWith("MANIFEST.MF")) return "📄";
  if (["png","jpg","jpeg","webp","gif","svg"].includes(ext)) return "🖼️";
  return "📄";
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  const limit = Math.min(bytes.length, 4096);
  let out = "";
  for (let i = 0; i < limit; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(8, "0");
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ").padEnd(48, " ");
    const ascii = Array.from(chunk).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : ".").join("");
    out += `${offset}  ${hex}  ${ascii}\n`;
  }
  if (bytes.length > limit) out += `\nShowing first ${formatBytes(limit)} of ${formatBytes(bytes.length)}.`;
  return out;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[s]));
}
