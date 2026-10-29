package com.khayaal.neighbour.data.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * The at-rest lock on the pairing record. A non-exportable AES-256 key lives in
 * AndroidKeyStore; GCM output is Base64 for DataStore. If the key is ever lost
 * (device wipe, keystore corruption) decryption simply fails and the app reads
 * the (removed) legacy plaintext — pairing again is the honest recovery.
 *
 * The key material never leaves the KeyStore; the API key is never logged.
 */
class PairingCipher(@Suppress("unused") private val context: Context) {

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun obtainKey(): SecretKey {
        val existing = runCatching {
            (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
        }.getOrNull()
        return existing ?: generateKey()
    }

    private fun generateKey(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(plaintext: String): String {
        val blob = AesGcmCrypto.encrypt(obtainKey(), plaintext.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(blob, android.util.Base64.NO_WRAP)
    }

    /** Null when the blob cannot be trusted (wrong key, tampered, alien version). */
    fun decrypt(blob: String): String? {
        val bytes = runCatching {
            android.util.Base64.decode(blob, android.util.Base64.NO_WRAP)
        }.getOrNull() ?: return null
        return AesGcmCrypto.decrypt(obtainKey(), bytes)?.toString(Charsets.UTF_8)
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "khayaal-neighbour-pairing-v1"
    }
}
