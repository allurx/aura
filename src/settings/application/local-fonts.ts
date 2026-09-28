/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 限定本机字体访问所需的浏览器接口，不扩充全局 Window 类型。
 */
interface LocalFontWindow extends Window {
    queryLocalFonts?: () => Promise<{ family: string }[]>;
}

/**
 * 只检查安全上下文与接口可用性，不读取字体或请求权限。
 */
export function supportsLocalFonts(): boolean {
    const fontWindow: LocalFontWindow = window;
    return fontWindow.isSecureContext && typeof fontWindow.queryLocalFonts === "function";
}

/**
 * 从用户操作中直接调用，保留浏览器的授权拒绝与安全限制异常。
 * 仅返回按字族去重排序的名称，不读取字体二进制数据。
 */
export async function readLocalFontFamilies(): Promise<string[]> {
    const fontWindow: LocalFontWindow = window;
    if (typeof fontWindow.queryLocalFonts !== "function") {
        throw new DOMException("当前浏览器不支持读取本机字体。", "NotSupportedError");
    }

    const fonts = await fontWindow.queryLocalFonts();
    const families = new Set(fonts.map((font) => font.family));
    return [...families].sort((left, right) => left.localeCompare(right));
}
