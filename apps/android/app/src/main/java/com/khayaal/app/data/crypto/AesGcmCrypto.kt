package com.khayaal.app.data.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM in one obvious format: [version byte | 12-byte IV | ciphertext+tag].
 * Deliberately free of Android imports so the round-trip is unit-testable on the
 * JVM; [PairingCipher] supplies the AndroidKeyStore key at runtime.
 */
object AesGcmCrypto {

    const val VERSION: Byte = 1

    private const val IV_SIZE = 12
    private const val TAG_BITS = 128
    private const val MIN_BLOB_SIZE = 1 + IV_SIZE + 16

    private val random = SecureRandom()

    /** Encrypts with a fresh random IV each call; the IV is stored alongside the ciphertext. */
    fun encrypt(key: SecretKey, plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = if (cipher.iv != null && cipher.iv.size == IV_SIZE) {
            cipher.iv
        } else {
            ByteArray(IV_SIZE).also { random.nextBytes(it) }.also { cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, it)) }
        }
        val ciphertext = cipher.doFinal(plaintext)
        return byteArrayOf(VERSION) + iv + ciphertext
    }

    /** Returns null instead of throwing — tampered or alien blobs simply don't decrypt. */
    fun decrypt(key: SecretKey, blob: ByteArray): ByteArray? = runCatching {
        require(blob.size >= MIN_BLOB_SIZE) { "Ciphertext too short" }
        require(blob[0] == VERSION) { "Unknown ciphertext version" }
        val iv = blob.copyOfRange(1, 1 + IV_SIZE)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        cipher.doFinal(blob, 1 + IV_SIZE, blob.size - 1 - IV_SIZE)
    }.getOrNull()
}
