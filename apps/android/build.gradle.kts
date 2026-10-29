// Root build file — plugin versions live in gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.android.application) apply false
    // The :shared SOS alarm module (used by this app, Family and Neighbour)
    // is an Android library; declaring it here keeps one AGP on the classpath.
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
