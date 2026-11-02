package com.pcrs.thermalguide.core.ui

import androidx.annotation.DrawableRes
import com.pcrs.thermalguide.R
import com.pcrs.thermalguide.core.recommendation.AvatarAsset

/** Exhaustive presentation mapping; no weather thresholds or outfit substitution here. */
@DrawableRes
fun avatarDrawable(asset: AvatarAsset): Int = when (asset) {
    AvatarAsset.THIN_LONG -> R.drawable.avatar_preview_long
    AvatarAsset.THIN_LONG_JACKET -> R.drawable.avatar_preview_jacket
    AvatarAsset.THIN_LONG_CARDIGAN -> R.drawable.avatar_outfit_cardigan_v1
    AvatarAsset.THIN_LIGHT -> R.drawable.avatar_outfit_thin_light_v1
    AvatarAsset.SHORT_LIGHT -> R.drawable.avatar_outfit_short_light_v1
    AvatarAsset.KNIT_MID_JACKET -> R.drawable.avatar_outfit_mid_jacket_v1
    AvatarAsset.KNIT_COAT -> R.drawable.avatar_outfit_coat_v1
    AvatarAsset.THERMAL_KNIT_PADDED -> R.drawable.avatar_outfit_padded_v1
}
