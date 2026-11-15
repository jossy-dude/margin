package app.marginalia.nativebits

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import java.io.File

/**
 * The phone vault on disk while phone Obsidian is closed (SYNC_ANDROID.md §6). Document URIs are BUILT from
 * paths (ExternalStorageProvider ids are `primary:<path>`), never found by listing, which is what makes SAF
 * slow. Replacing a file writes `.<name>.sync.tmp` and renames it (the ignore list skips `.*.tmp`).
 * With "All files access" granted it uses plain `java.io.File` on the same folder instead (fast mode, P0.4).
 */
class SyncVault(private val c: Context, treeUriString: String) {
  private val tree: Uri = Uri.parse(treeUriString)
  private val treeId: String = DocumentsContract.getTreeDocumentId(tree)
  private val cr get() = c.contentResolver
  /** `/storage/emulated/0/<path>` when All-files access is on and the tree is on primary storage. */
  private val fileRoot: File? = run {
    if (Build.VERSION.SDK_INT < 30 || !Environment.isExternalStorageManager()) return@run null
    if (!treeId.startsWith("primary:")) return@run null
    File(Environment.getExternalStorageDirectory(), treeId.removePrefix("primary:")).takeIf { it.isDirectory }
  }
  val fast get() = fileRoot != null

  private fun docId(rel: String) = if (rel.isEmpty()) treeId else "$treeId/$rel"
  private fun uri(rel: String) = DocumentsContract.buildDocumentUriUsingTree(tree, docId(rel))

  data class Stat(val size: Long, val mtime: Long)
  fun stat(rel: String): Stat? {
    fileRoot?.let { val f = File(it, rel); return if (f.isFile) Stat(f.length(), f.lastModified()) else null }
    return try {
      cr.query(uri(rel), arrayOf(Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED, Document.COLUMN_MIME_TYPE), null, null, null)?.use {
        if (it.moveToFirst() && it.getString(2) != Document.MIME_TYPE_DIR) Stat(it.getLong(0), it.getLong(1)) else null
      }
    } catch (e: Exception) { null }
  }
  fun read(rel: String): ByteArray? {
    fileRoot?.let { val f = File(it, rel); return if (f.isFile) f.readBytes() else null }
    return try { cr.openInputStream(uri(rel))?.use { it.readBytes() } } catch (e: Exception) { null }
  }

  private fun ensureDir(rel: String) {
    if (rel.isEmpty()) return
    if (stat(rel) == null && !isDir(rel)) {
      val parent = rel.substringBeforeLast('/', "")
      ensureDir(parent)
      DocumentsContract.createDocument(cr, uri(parent), Document.MIME_TYPE_DIR, rel.substringAfterLast('/'))
    }
  }
  private fun isDir(rel: String): Boolean = try {
    cr.query(uri(rel), arrayOf(Document.COLUMN_MIME_TYPE), null, null, null)?.use { it.moveToFirst() && it.getString(0) == Document.MIME_TYPE_DIR } ?: false
  } catch (e: Exception) { false }

  fun write(rel: String, bytes: ByteArray) = writeFrom(rel) { it.write(bytes) }
  /** A big file that arrived in parts, streamed from Margin's cache instead of loaded into memory. */
  fun writeFile(rel: String, src: File) = writeFrom(rel) { out -> src.inputStream().use { it.copyTo(out, 256 * 1024) } }
  private fun writeFrom(rel: String, fill: (java.io.OutputStream) -> Unit) {
    fileRoot?.let {
      val f = File(it, rel); f.parentFile?.mkdirs()
      val tmp = File(f.parentFile, ".${f.name}.sync.tmp"); tmp.outputStream().use(fill)
      if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
      return
    }
    val parent = rel.substringBeforeLast('/', ""); val name = rel.substringAfterLast('/')
    ensureDir(parent)
    val tmpName = ".$name.sync.tmp"
    try { DocumentsContract.deleteDocument(cr, uri(if (parent.isEmpty()) tmpName else "$parent/$tmpName")) } catch (e: Exception) { }
    val tmp = DocumentsContract.createDocument(cr, uri(parent), "application/octet-stream", tmpName) ?: throw IllegalStateException("cannot create $rel")
    cr.openOutputStream(tmp, "wt")!!.use(fill)
    if (stat(rel) != null) DocumentsContract.deleteDocument(cr, uri(rel))
    DocumentsContract.renameDocument(cr, tmp, name)
  }
  /** A hash of the file as it is on storage now, streamed (checks a write really landed). */
  fun hashOf(rel: String): String? = try {
    val md = java.security.MessageDigest.getInstance("SHA-256")
    val input = fileRoot?.let { File(it, rel).takeIf { f -> f.isFile }?.inputStream() } ?: if (fileRoot == null) cr.openInputStream(uri(rel)) else null
    input?.use { s -> val buf = ByteArray(256 * 1024); while (true) { val n = s.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
      ?.let { Seal.hex(md.digest()).substring(0, 32) }
  } catch (e: Exception) { null }

  /** A delete from sync moves the file into the vault's `.trash/` (Obsidian's own trash, never synced), so a
   *  wrong delete can be undone by hand. Plain delete when the move is not possible. */
  fun delete(rel: String) {
    fileRoot?.let { root ->
      val f = File(root, rel); if (!f.exists()) return
      val t = File(root, ".trash/$rel"); t.parentFile?.mkdirs(); if (t.exists()) t.delete()
      if (!f.renameTo(t)) f.delete()
      return
    }
    try {
      val parent = rel.substringBeforeLast('/', "")
      val trashDir = if (parent.isEmpty()) ".trash" else ".trash/$parent"
      ensureDir(trashDir)
      val old = "$trashDir/${rel.substringAfterLast('/')}"
      if (stat(old) != null) DocumentsContract.deleteDocument(cr, uri(old))
      if (DocumentsContract.moveDocument(cr, uri(rel), uri(parent), uri(trashDir)) != null) return
    } catch (e: Exception) { }
    try { DocumentsContract.deleteDocument(cr, uri(rel)) } catch (e: Exception) { }
  }

  data class Entry(val path: String, val size: Long, val mtime: Long)
  /** Every syncable file: one children query per folder (the rare full compare, e.g. the first manifest). */
  fun walk(ignore: SyncIgnore): List<Entry> {
    val out = ArrayList<Entry>()
    fileRoot?.let { root ->
      if (!root.canRead()) throw IllegalStateException("cannot read ${root.path}")
      root.walkTopDown().onEnter { d -> d == root || !ignore.matches(d.relativeTo(root).invariantSeparatorsPath + "/") }.forEach { f ->
        if (f.isFile) { val rel = f.relativeTo(root).invariantSeparatorsPath; if (!ignore.matches(rel)) out.add(Entry(rel, f.length(), f.lastModified())) }
      }
      return out
    }
    fun rec(rel: String) {
      val kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId(rel))
      val cols = arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED)
      val dirs = ArrayList<String>()
      // a folder that cannot be listed THROWS: a partial list would look like deleted files (v0.7.1)
      val cur = cr.query(kids, cols, null, null, null) ?: throw IllegalStateException("cannot list ${rel.ifEmpty { "the vault folder" }}")
      cur.use {
        while (it.moveToNext()) {
          val p = if (rel.isEmpty()) it.getString(0) else "$rel/${it.getString(0)}"
          if (it.getString(1) == Document.MIME_TYPE_DIR) { if (!ignore.matches("$p/")) dirs.add(p) }
          else if (!ignore.matches(p)) out.add(Entry(p, it.getLong(2), it.getLong(3)))
        }
      }
      dirs.forEach { rec(it) }
    }
    rec("")
    return out
  }
}

/** The `.bone-sync-ignore` rules (gitignore syntax), a port of `vault-sync/core/src/ignore.js`. */
class SyncIgnore(text: String = DEFAULT) {
  companion object {
    /** Same list as ignore.js DEFAULT_IGNORE (keep them in step). */
    const val DEFAULT = ".git/\n.obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.obsidian/workspace-*.json\n.obsidian/cache/\n.trash/\n" +
      ".obsidian/plugins/bone-media/cache.json\n.obsidian/plugins/bone-yt/cache.json\n.obsidian/plugins/bone-chess/cache/\n.obsidian/plugins/harper/\n" +
      ".obsidian/plugins/*/node_modules/\n.obsidian/plugins/remotely-save/data.json\n.obsidian/plugins/obsidian-livesync/data.json\n" +
      ".smart-env/\n.claudian/\n.autoresearch/\nnode_modules/\n.stfolder/\n.stversions/\n.Trash-*/\n\$RECYCLE.BIN/\n.thumbnails/\n" +
      "conflict-files-obsidian-git.md\n*.tmp\n.*.tmp\n*.swp\n*.swo\n*~\n.~lock.*#\n*.crdownload\n*.part\n~\$*\n.DS_Store\nThumbs.db\n" +
      "desktop.ini\n.directory\n.nomedia\n"
    /** ignore.js HARD_IGNORE: never synced, whatever `.bone-sync-ignore` says. */
    const val HARD = ".git/\n*.sync.tmp\n.bone-sync-in/\n"
  }
  private val hard: SyncIgnore? = if (text == HARD) null else SyncIgnore(HARD)
  private data class Rule(val neg: Boolean, val re: Regex)
  private val rules: List<Rule> = text.lines().mapNotNull { line ->
    var r = line.trimEnd()
    if (r.isEmpty() || r.startsWith("#")) return@mapNotNull null
    var neg = false
    if (r.startsWith("!")) { neg = true; r = r.substring(1) }
    if (r.endsWith("/")) r = r.dropLast(1)
    val anchored = r.startsWith("/") || r.contains("/")
    if (r.startsWith("/")) r = r.substring(1)
    val sb = StringBuilder()
    var i = 0
    while (i < r.length) {
      val ch = r[i]
      when {
        ch == '*' && i + 1 < r.length && r[i + 1] == '*' -> { sb.append(".*"); i++; if (i + 1 < r.length && r[i + 1] == '/') i++ }
        ch == '*' -> sb.append("[^/]*")
        ch == '?' -> sb.append("[^/]")
        ".+^\${}()|[]\\".indexOf(ch) >= 0 -> sb.append('\\').append(ch)
        else -> sb.append(ch)
      }
      i++
    }
    Rule(neg, Regex((if (anchored) "^" else "(^|/)") + sb + "(/.*)?$"))
  }
  fun matches(path: String): Boolean {
    if (hard?.matches(path) == true) return true
    var hit = false
    for (r in rules) if (r.re.containsMatchIn(path)) hit = !r.neg
    return hit
  }
}
