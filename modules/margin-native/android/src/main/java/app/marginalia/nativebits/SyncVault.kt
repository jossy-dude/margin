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

  fun write(rel: String, bytes: ByteArray) {
    fileRoot?.let {
      val f = File(it, rel); f.parentFile?.mkdirs()
      val tmp = File(f.parentFile, ".${f.name}.sync.tmp"); tmp.writeBytes(bytes)
      if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
      return
    }
    val parent = rel.substringBeforeLast('/', ""); val name = rel.substringAfterLast('/')
    ensureDir(parent)
    val tmpName = ".$name.sync.tmp"
    try { DocumentsContract.deleteDocument(cr, uri(if (parent.isEmpty()) tmpName else "$parent/$tmpName")) } catch (e: Exception) { }
    val tmp = DocumentsContract.createDocument(cr, uri(parent), "application/octet-stream", tmpName) ?: throw IllegalStateException("cannot create $rel")
    cr.openOutputStream(tmp, "wt")!!.use { it.write(bytes) }
    if (stat(rel) != null) DocumentsContract.deleteDocument(cr, uri(rel))
    DocumentsContract.renameDocument(cr, tmp, name)
  }
  fun delete(rel: String) {
    fileRoot?.let { File(it, rel).delete(); return }
    try { DocumentsContract.deleteDocument(cr, uri(rel)) } catch (e: Exception) { }
  }

  data class Entry(val path: String, val size: Long, val mtime: Long)
  /** Every syncable file: one children query per folder (the rare full compare, e.g. the first manifest). */
  fun walk(ignore: SyncIgnore): List<Entry> {
    val out = ArrayList<Entry>()
    fileRoot?.let { root ->
      root.walkTopDown().onEnter { d -> d == root || !ignore.matches(d.relativeTo(root).invariantSeparatorsPath + "/") }.forEach { f ->
        if (f.isFile) { val rel = f.relativeTo(root).invariantSeparatorsPath; if (!ignore.matches(rel)) out.add(Entry(rel, f.length(), f.lastModified())) }
      }
      return out
    }
    fun rec(rel: String) {
      val kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId(rel))
      val cols = arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED)
      val dirs = ArrayList<String>()
      try {
        cr.query(kids, cols, null, null, null)?.use {
          while (it.moveToNext()) {
            val p = if (rel.isEmpty()) it.getString(0) else "$rel/${it.getString(0)}"
            if (it.getString(1) == Document.MIME_TYPE_DIR) { if (!ignore.matches("$p/")) dirs.add(p) }
            else if (!ignore.matches(p)) out.add(Entry(p, it.getLong(2), it.getLong(3)))
          }
        }
      } catch (e: Exception) { }
      dirs.forEach { rec(it) }
    }
    rec("")
    return out
  }
}

/** The `.bone-sync-ignore` rules (gitignore syntax), a port of `vault-sync/core/src/ignore.js`. */
class SyncIgnore(text: String = DEFAULT) {
  companion object {
    const val DEFAULT = ".git/\n.obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.obsidian/workspace-*.json\n.obsidian/cache/\n.trash/\n" +
      ".obsidian/plugins/bone-media/cache.json\n.obsidian/plugins/bone-yt/cache.json\n.obsidian/plugins/bone-chess/cache/\n.obsidian/plugins/harper/\n" +
      ".smart-env/\n.claudian/\n.autoresearch/\nconflict-files-obsidian-git.md\n*.tmp\n.*.tmp\n~\$*\n.DS_Store\nThumbs.db\n"
  }
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
    var hit = false
    for (r in rules) if (r.re.containsMatchIn(path)) hit = !r.neg
    return hit
  }
}
