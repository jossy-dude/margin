package app.marginalia.nativebits

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * bone-sync/1 crypto, byte-for-byte the same as `vault-sync/core/src/seal.js` and `hash.js`
 * (SYNC_PROTOCOL.md §3, §6):
 *   proof   = hex(HMAC-SHA256(pairKey, "nonce|deviceId|vaultId"))
 *   session = HKDF-SHA256(pairKey, salt = serverNonce ‖ clientNonce, info = "bone-sync/1 seal") → AES-256-GCM
 *   sealed  = {"t":"sealed","d": base64(iv12 ‖ ciphertext ‖ tag16)}
 *   hash    = first 128 bits of SHA-256, hex
 */
object Seal {
  private val rng = SecureRandom()
  fun random(n: Int) = ByteArray(n).also { rng.nextBytes(it) }
  fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
  fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  fun nonce() = hex(random(16))

  fun hash(b: ByteArray): String = hex(MessageDigest.getInstance("SHA-256").digest(b)).substring(0, 32)

  private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  fun base32(bytes: ByteArray): String {
    val sb = StringBuilder(); var bits = 0; var v = 0
    for (b in bytes) { v = (v shl 8) or (b.toInt() and 0xff); bits += 8; while (bits >= 5) { sb.append(B32[(v ushr (bits - 5)) and 31]); bits -= 5 } }
    if (bits > 0) sb.append(B32[(v shl (5 - bits)) and 31])
    return sb.toString()
  }
  fun newId() = base32(random(16))

  fun hmac(key: ByteArray, data: ByteArray): ByteArray = Mac.getInstance("HmacSHA256").run { init(SecretKeySpec(key, "HmacSHA256")); doFinal(data) }
  fun proof(key: ByteArray, nonce: String, deviceId: String, vaultId: String) = hex(hmac(key, "$nonce|$deviceId|$vaultId".toByteArray()))
  fun sameHex(a: String?, b: String) = a != null && MessageDigest.isEqual(a.toByteArray(), b.toByteArray())

  /** RFC 5869, the same as WebCrypto's and Node's HKDF. */
  fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, len: Int = 32): ByteArray {
    val prk = hmac(if (salt.isEmpty()) ByteArray(32) else salt, ikm)
    val out = java.io.ByteArrayOutputStream(); var t = ByteArray(0); var i = 1
    while (out.size() < len) { t = hmac(prk, t + info + byteArrayOf(i.toByte())); out.write(t); i++ }
    return out.toByteArray().copyOf(len)
  }
  fun sessionKey(pairKey: ByteArray, serverNonce: String, clientNonce: String) =
    hkdf(pairKey, unhex(serverNonce) + unhex(clientNonce), "bone-sync/1 seal".toByteArray())
  /** The key a typed 8-word phrase stands for (vault-sync/daemon/keys.js `keyFromCode`). */
  fun keyFromCode(code: ByteArray, vaultId: String) = hkdf(code, vaultId.toByteArray(), "bone-sync/1 pair".toByteArray())

  fun seal(key: ByteArray, text: String): String {
    val iv = random(12)
    val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv)) }
    val ct = c.doFinal(text.toByteArray())
    return "{\"t\":\"sealed\",\"d\":\"${Base64.encodeToString(iv + ct, Base64.NO_WRAP)}\"}"
  }
  fun unseal(key: ByteArray, frame: String): String {
    val d = org.json.JSONObject(frame).getString("d")
    val raw = Base64.decode(d, Base64.NO_WRAP)
    val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, raw, 0, 12)) }
    return String(c.doFinal(raw, 12, raw.size - 12))
  }

  /** The 256-word list of seal.js, in order (the 8-word phrase is 8 indexes). */
  val WORDS: List<String> = ("acid aunt bake bank barn bead bell bird boat bone book boot bowl brag bread brick bull cake calm camp " +
    "card cart cave chef chip city clay coal coat code coin cold cook corn crab crow cube cup dart dawn deer desk dice dish dock " +
    "dove drum duck dune dust echo edge eggs elk fact farm fern film fire fish flag flute foam fog fork fox frog gate gear gift " +
    "glow goat gold golf gown grain grape grass gull hail hand harp hat hawk heart herb hill hive hook horn hut iron jade jam jar " +
    "jazz jeep kale kelp key kite knot lake lamp lark leaf lens lily lime lion loaf lock loom lute mail mango map mask meal mild " +
    "milk mint mole moon moss moth mug nail nest net nose oak oar oath oven owl palm pan park pear pen pier pig pine pipe plum " +
    "pond pony pool port pot pump quail quilt raft rain ramp reed reef rice ring road robe rock roof rope rose ruby rug sail salt " +
    "sand seal seed shed ship shoe silk sky slate sled snow soap sock sofa soup spade star stem stew stone straw sun swan tack " +
    "tail tank tape tea tent tide tile toad toast tooth tower toy tram tree tulip tuna twig urn vase veil vest vine violin wagon " +
    "wall wand wasp wave wax well whale wheat whip wind wing wolf wool worm yak yard yarn yew yolk zebra zinc acorn amber anvil " +
    "apron arrow atlas badge banjo basil beach berry blade bloom brook brush cabin camel candle canoe cedar chalk cider cloud " +
    "clove comet coral crane crown daisy delta denim").split(" ").take(256)
  fun wordsToCode(s: String): ByteArray? {
    val w = s.trim().lowercase().split(Regex("\\s+"))
    if (w.size != 8) return null
    val out = ByteArray(8)
    for (k in 0 until 8) { val i = WORDS.indexOf(w[k]); if (i < 0) return null; out[k] = i.toByte() }
    return out
  }
}

/** Pair keys at rest: encrypted with a non-exportable AES key in the Android Keystore, stored in prefs. */
object KeyVault {
  private const val ALIAS = "bone_sync_wrap"
  private const val PREFS = "margin_sync_keys"
  private fun wrapKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
    return g.generateKey()
  }
  fun put(c: Context, name: String, secret: ByteArray) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, wrapKey()) }
    val blob = cipher.iv + cipher.doFinal(secret)
    c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(name, Base64.encodeToString(blob, Base64.NO_WRAP)).apply()
  }
  fun get(c: Context, name: String): ByteArray? {
    val s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(name, null) ?: return null
    return try {
      val raw = Base64.decode(s, Base64.NO_WRAP)
      Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, raw, 0, 12)) }.doFinal(raw, 12, raw.size - 12)
    } catch (e: Exception) { null }
  }
  fun remove(c: Context, name: String) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(name).apply() }
}
