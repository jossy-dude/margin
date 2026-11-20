package app.marginalia.nativebits

/**
 * File classes (v0.8 SPEC §1.2), a port of `vault-sync/core/src/classes.js`; both run `fixtures/classes.json`
 * (copied to src/test/resources). Plain Kotlin, no Android, so the JVM unit test can run it.
 *
 *   note    *.md / *.canvas / *.base outside .obsidian/   both ways; the hub merges, a clash goes to Conflicts/
 *   plugin  plugin code and assets, snippets, themes      desktop → phone only: never sent from the phone
 *   shared  allow-listed plugin data, .obsidian/<name>.json   both ways (json3 on the hub)
 *   local   workspace, *.local.json, other plugin data     never synced
 *   single  one writer (Margin's notes, *.phone.json)      the writer's version wins
 *   file    everything else                                both ways
 */
object FileClasses {
  data class Klass(val cls: String, val writer: String? = null)

  val CLASSES = listOf("note", "plugin", "shared", "local", "single", "file")
  val SHARED_PLUGIN_DATA = listOf(
    "bone-calendar/data.json", "bone-cards/data.json", "bone-chess/data.json", "bone-chess/studies.json",
    "bone-emoji/data.json", "bone-fix/data.json", "bone-fix/fixes.json", "bone-media/data.json", "bone-notes/data.json",
    "bone-tasks/data.json", "bone-type/data.json", "bone-yt/data.json", "bone-yt/history.json", "bone-home/read.json",
    "obsidian-excalidraw-plugin/data.json", "obsidian-style-settings/data.json")
  val MARGIN_FILES = listOf(".margin/margin.json", "Margin/Timetable.md", "Margin/Subjects.md", "Margin/Notices.md")

  val DEFAULTS: String = buildString {
    append("local .obsidian/workspace*.json\nlocal .obsidian/app.json\nlocal **/*.local.json\nlocal .margin/obsidian.json\n")
    append("local .obsidian/plugins/*/data.json\n")
    for (p in SHARED_PLUGIN_DATA) append("shared .obsidian/plugins/").append(p).append('\n')
    append("single:phone **/*.phone.json\nsingle:desktop **/*.desktop.json\n")
    for (p in MARGIN_FILES) append("single:phone ").append(p).append('\n')
  }

  internal fun globToRegex(g: String): Regex {
    val re = StringBuilder("^")
    var i = 0
    while (i < g.length) {
      val c = g[i]
      when {
        c == '*' && i + 1 < g.length && g[i + 1] == '*' -> {
          i++
          if (i + 1 < g.length && g[i + 1] == '/') { i++; re.append("(?:.*/)?") } else re.append(".*")
        }
        c == '*' -> re.append("[^/]*")
        c == '?' -> re.append("[^/]")
        ".+^\${}()|[]\\".indexOf(c) >= 0 -> re.append('\\').append(c)
        else -> re.append(c)
      }
      i++
    }
    return Regex(re.append('$').toString())
  }

  private val NOTE_RE = Regex("\\.(md|canvas|base)$", RegexOption.IGNORE_CASE)
  private val TOP_JSON = Regex("^[^/]+\\.json$")

  private fun builtin(p: String): Klass {
    if (p.startsWith(".obsidian/")) {
      val rest = p.removePrefix(".obsidian/")
      if (rest.startsWith("plugins/") || rest.startsWith("snippets/") || rest.startsWith("themes/")) return Klass("plugin")
      if (TOP_JSON.matches(rest)) return Klass("shared")
      return Klass("plugin")
    }
    if (NOTE_RE.containsMatchIn(p)) return Klass("note")
    return Klass("file")
  }

  private data class Rule(val re: Regex, val cls: String, val writer: String?)

  /** The table with the vault's own `.bone-sync-classes` rules after the defaults (later lines win). */
  class Table(extra: String = "") {
    private val rules: List<Rule> = ("$DEFAULTS\n$extra").lines().mapNotNull { raw ->
      val line = raw.replace(Regex("#.*$"), "").trim()
      if (line.isEmpty()) return@mapNotNull null
      val parts = line.split(Regex("\\s+"))
      if (parts.size != 2) return@mapNotNull null
      val cls = parts[0].substringBefore(':')
      val writer = if (parts[0].contains(':')) parts[0].substringAfter(':') else null
      if (cls !in CLASSES) return@mapNotNull null
      if (cls == "single" && writer != "phone" && writer != "desktop") return@mapNotNull null
      Rule(globToRegex(parts[1]), cls, if (cls == "single") writer else null)
    }
    fun of(p: String): Klass {
      var hit = builtin(p)
      for (r in rules) if (r.re.matches(p)) hit = Klass(r.cls, r.writer)
      return hit
    }
  }

  /** May this side ('phone' or 'desktop') send a change to a path of this class? */
  fun mayWrite(k: Klass, side: String): Boolean = when (k.cls) {
    "local" -> false
    "plugin" -> side == "desktop"
    "single" -> k.writer == side
    else -> true
  }
}
