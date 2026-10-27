package com.khayaal.app

import com.khayaal.app.data.crypto.AesGcmCrypto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * The pairing record's at-rest encryption: AES-256-GCM round-trips, tampering
 * fails loudly (well — silently, returning null), and every encryption uses a
 * fresh IV.
 */
class AesGcmCryptoTest {

    private fun newKey(): SecretKey =
        KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    @Test
    fun `round trip returns the plaintext`() {
        val key = newKey()
        val secret = """{"householdId":"hh_1","sourceId":"src_9","apiKey":"sk-live--do-not-log"}"""

        val blob = AesGcmCrypto.encrypt(key, secret.toByteArray(Charsets.UTF_8))
        val recovered = AesGcmCrypto.decrypt(key, blob)?.toString(Charsets.UTF_8)

        assertEquals(secret, recovered)
    }

    @Test
    fun `round trip survives binary payloads`() {
        val key = newKey()
        val payload = ByteArray(1024) { (it % 251).toByte() }

        val blob = AesGcmCrypto.encrypt(key, payload)

        assertArrayEquals(payload, AesGcmCrypto.decrypt(key, blob))
    }

    @Test
    fun `every encryption uses a fresh iv`() {
        val key = newKey()
        val message = "same message"

        val first = AesGcmCrypto.encrypt(key, message.toByteArray())
        val second = AesGcmCrypto.encrypt(key, message.toByteArray())

        assertFalse(first.contentEquals(second))
        // 1 version byte + 12 IV bytes prefix.
        assertFalse(first.sliceArray(1..12).contentEquals(second.sliceArray(1..12)))
    }

    @Test
    fun `a flipped bit refuses to decrypt`() {
        val key = newKey()
        val blob = AesGcmCrypto.encrypt(key, "pairing".toByteArray())

        // Tamper with the ciphertext body (last byte).
        blob[blob.size - 1] = (blob[blob.size - 1].toInt() xor 0x01).toByte()

        assertNull(AesGcmCrypto.decrypt(key, blob))
    }

    @Test
    fun `wrong key refuses to decrypt`() {
        val blob = AesGcmCrypto.encrypt(newKey(), "pairing".toByteArray())

        assertNull(AesGcmCrypto.decrypt(newKey(), blob))
    }

    @Test
    fun `truncated and alien blobs are rejected`() {
        val key = newKey()

        assertNull(AesGcmCrypto.decrypt(key, ByteArray(4)))
        assertNull(AesGcmCrypto.decrypt(key, byteArrayOf(9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)))
        // Version 1 prefix but no IV/body at all.
        assertNull(AesGcmCrypto.decrypt(key, byteArrayOf(AesGcmCrypto.VERSION)))
    }

    @Test
    fun `blob is large enough to hold iv and tag`() {
        val key = newKey()
        val blob = AesGcmCrypto.encrypt(key, "x".toByteArray())
        // version(1) + iv(12) + ciphertext(1) + gcm tag(16)
        assertTrue(blob.size >= 1 + 12 + 1 + 16)
    }
}
