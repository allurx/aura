/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 按浏览器报告的平台选择页面的本机字体，不据型号或系统版本猜测厂商字体。
 * 平台信息只影响显示偏好；字体缺失或字符不受支持时仍由浏览器回退。
 */
export function getPlatformFontFamily(browser: { userAgent: string; userAgentData?: { platform: string } }): string {
    // 鸿蒙的 UA 可能同时包含其他系统标识，优先使用其浏览器字体映射。
    if (/OpenHarmony|HarmonyOS/i.test(browser.userAgent)) return "sans-serif";

    // Client Hints 可用时优先使用平台信息，其余浏览器沿用 UA 中的系统标识。
    const reportedPlatform = browser.userAgentData?.platform ?? "";
    const platform = reportedPlatform.length > 0 ? reportedPlatform : browser.userAgent;
    if (/Windows/i.test(platform)) return '"Microsoft YaHei", "Microsoft YaHei UI", sans-serif';
    if (/macOS|Macintosh|Mac OS X|iPhone|iPad|iPod|iOS/i.test(platform)) {
        return 'system-ui, -apple-system, "PingFang SC", sans-serif';
    }

    // Android 的 UA 也包含 Linux；系统中文字体通常通过无名称的回退字族提供。
    if (/Android/i.test(platform)) return "sans-serif";
    if (/CrOS|Chrome OS/i.test(platform)) return '"Noto Sans CJK SC", "Noto Sans SC", sans-serif';
    if (/Linux/i.test(platform)) {
        return '"Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", "WenQuanYi Zen Hei", sans-serif';
    }
    return "sans-serif";
}
